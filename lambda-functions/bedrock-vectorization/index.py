"""
BedrockToS3Vectorization Function - Version 4.0
Latest Changes:
- Added comprehensive debug logging for bucket references and metadata keys
- Fixed metadata key count issue (chunk-specific metadata was causing >10 keys)
- Enhanced error tracking for S3 bucket access
- Added detailed logging for S3 Vectors batch processing
- Fixed environment variable mapping for fallback bucket
Author: Assistant
Date: 2025-09-05
"""

import json
import boto3
import os
import urllib.parse
from botocore.exceptions import ClientError
import re
from datetime import datetime

# --- CONFIGURATION ---
S3_VECTORS_BUCKET = os.environ.get(
    "S3_VECTORS_BUCKET", "pdf-conversation-vectors-198945929229"
)
S3_JSON_FALLBACK_BUCKET = os.environ.get(
    "S3_JSON_FALLBACK_BUCKET", "pdf-conversation-vectors-json-198945929229"
)
S3_VECTOR_INDEX_NAME = os.environ.get("S3_VECTOR_INDEX_NAME", "document-chunks-index")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")
EMBEDDING_MODEL_ID = "cohere.embed-multilingual-v3"
PROCESSED_BUCKET = os.environ.get("PROCESSED_BUCKET", "pdf-conversation-digests")
METADATA_TABLE = os.environ.get("METADATA_TABLE", "pdf-conversation-metadata")
VECTORIZATION_COMPLETE_TOPIC = os.environ.get("VECTORIZATION_COMPLETE_TOPIC", "")
MAX_CHUNK_CHARS = 2000
CHUNK_OVERLAP = int(os.environ.get("CHUNK_OVERLAP", "100"))
MAX_CHUNKS_PER_DOCUMENT = int(os.environ.get("MAX_CHUNKS_PER_DOCUMENT", "500"))

# Initialize AWS clients
s3_client = boto3.client("s3")
dynamodb_client = boto3.client("dynamodb", region_name=REGION_NAME)
bedrock_client = boto3.client("bedrock-runtime", region_name=REGION_NAME)
sns_client = boto3.client("sns", region_name=REGION_NAME)


def print_config():
    """Debug function to print all configuration values"""
    print("=== CONFIGURATION DEBUG ===")
    print(f"S3_VECTORS_BUCKET: {S3_VECTORS_BUCKET}")
    print(f"S3_JSON_FALLBACK_BUCKET: {S3_JSON_FALLBACK_BUCKET}")
    print(f"S3_VECTOR_INDEX_NAME: {S3_VECTOR_INDEX_NAME}")
    print(f"PROCESSED_BUCKET: {PROCESSED_BUCKET}")
    print(f"REGION_NAME: {REGION_NAME}")
    print("=========================")


def intelligent_chunk_text(text, max_chunk_size=MAX_CHUNK_CHARS, overlap=CHUNK_OVERLAP):
    """Split text into chunks respecting Cohere's character limits"""
    if len(text) <= max_chunk_size:
        return [text]

    chunks = []
    paragraphs = text.split("\n\n")
    current_chunk = ""

    for paragraph in paragraphs:
        if len(current_chunk) + len(paragraph) + 2 > max_chunk_size:
            if current_chunk:
                chunks.append(current_chunk.strip())

                if len(chunks) >= MAX_CHUNKS_PER_DOCUMENT:
                    print(f"Reached maximum chunk limit ({MAX_CHUNKS_PER_DOCUMENT})")
                    break

                if overlap > 0 and len(current_chunk) > overlap:
                    current_chunk = current_chunk[-overlap:] + "\n\n" + paragraph
                else:
                    current_chunk = paragraph

                if len(current_chunk) > max_chunk_size:
                    sentences = re.split(r"[.!?]+\s+", paragraph)
                    current_chunk = ""
                    for sentence in sentences:
                        if len(current_chunk) + len(sentence) + 1 > max_chunk_size:
                            if current_chunk:
                                chunks.append(current_chunk.strip())
                                if len(chunks) >= MAX_CHUNKS_PER_DOCUMENT:
                                    break
                            current_chunk = sentence
                        else:
                            if current_chunk:
                                current_chunk += " " + sentence
                            else:
                                current_chunk = sentence
            else:
                current_chunk = paragraph[:max_chunk_size]
        else:
            if current_chunk:
                current_chunk += "\n\n" + paragraph
            else:
                current_chunk = paragraph

    if current_chunk and len(chunks) < MAX_CHUNKS_PER_DOCUMENT:
        chunks.append(current_chunk.strip())

    return [chunk for chunk in chunks if chunk.strip()]


def get_vector_embeddings(text):
    """Get vector embeddings with proper error handling"""
    try:
        if len(text) > 2048:
            print(f"Warning: Text length {len(text)} exceeds Cohere limit, truncating")
            text = text[:2048]

        if not text.strip():
            raise ValueError("Empty text provided for embedding")

        print(f"Processing chunk with {len(text)} characters")

        response = bedrock_client.invoke_model(
            body=json.dumps({"texts": [text], "input_type": "search_document"}),
            modelId=EMBEDDING_MODEL_ID,
            accept="application/json",
            contentType="application/json",
        )
        response_body = json.loads(response.get("body").read())
        embedding = response_body["embeddings"][0]

        print(f"Generated embedding with {len(embedding)} dimensions")
        return embedding

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "Unknown")
        print(f"Bedrock error ({error_code}): {e}")
        raise e


def create_chunk_metadata(chunk_text, chunk_index, document_data, page_info=None):
    """Create metadata for vector chunks.

    Uses chunk_text as non-filterable metadata (configured at index creation time)
    to store full text without hitting the 2KB filterable metadata limit.

    Filterable metadata: document_id, user_id, filename, chunk_index, etc.
    Non-filterable metadata: chunk_text (full text for RAG retrieval)
    """
    print(f"=== CREATING METADATA FOR CHUNK {chunk_index} ===")

    # Filterable metadata (for queries) - must stay under 2KB total
    # Non-filterable metadata (chunk_text) - no size limit in filterable space
    metadata = {
        # Filterable metadata (for query filters)
        "document_id": document_data["document_id"],
        "user_id": document_data["user_id"],
        "filename": document_data.get("original_filename", "unknown")[:50],
        "chunk_index": str(chunk_index),  # Convert to string
        "chunk_size": str(len(chunk_text)),  # Convert to string
        "model": EMBEDDING_MODEL_ID,
        "pages": ",".join(map(str, page_info)) if page_info else "1",
        # Non-filterable metadata (returned with results, not for filtering)
        "chunk_text": chunk_text,  # Full text for RAG - not subject to 2KB limit
    }

    # Add content type indicator
    if "table" in chunk_text.lower() or "|" in chunk_text:
        metadata["content_type"] = "table"
    elif any(indicator in chunk_text.lower() for indicator in ["form", "field", ":"]):
        metadata["content_type"] = "form"
    else:
        metadata["content_type"] = "text"

    print(f"Metadata key count: {len(metadata)}")
    print(f"Metadata keys: {list(metadata.keys())}")
    print(f"Chunk text length: {len(chunk_text)} chars (non-filterable)")

    print("=== END METADATA CREATION ===")
    return metadata


def determine_chunk_pages(chunk_text, page_texts):
    """Determine which pages a chunk spans"""
    pages = []
    chunk_lines = [line.strip() for line in chunk_text.split("\n") if line.strip()]

    for page_num, page_content in page_texts.items():
        if isinstance(page_content, list):
            page_text = " ".join(page_content)
        else:
            page_text = str(page_content)

        for line in chunk_lines[:2]:
            if len(line) > 10 and line in page_text:
                pages.append(int(page_num))
                break

    return sorted(list(set(pages))) if pages else [1]


def store_chunk_texts_for_rag(vectors_data, document_id, user_id):
    """Store full chunk texts in S3 for RAG retrieval (separate from vector metadata)"""
    print("=== STORING CHUNK TEXTS FOR RAG ===")
    print(f"Target bucket: {S3_JSON_FALLBACK_BUCKET}")
    print(f"Document ID: {document_id}")

    try:
        chunk_texts_key = f"chunks/{user_id}/{document_id}.json"

        # Create chunk texts structure for RAG retrieval
        chunk_texts_data = {
            "document_id": document_id,
            "user_id": user_id,
            "chunk_count": len(vectors_data),
            "created_at": datetime.utcnow().isoformat(),
            "chunks": {
                v["chunk_id"]: {
                    "text": v["text"],  # Full chunk text
                    "chunk_index": v["metadata"]["chunk_index"],
                    "pages": v["metadata"].get("pages", "1"),
                    "content_type": v["metadata"].get("content_type", "text"),
                }
                for v in vectors_data
            },
        }

        s3_client.put_object(
            Bucket=S3_JSON_FALLBACK_BUCKET,
            Key=chunk_texts_key,
            Body=json.dumps(chunk_texts_data, indent=2),
            ContentType="application/json",
            Metadata={
                "document-id": document_id,
                "user-id": user_id,
                "chunk-count": str(len(vectors_data)),
            },
        )

        print(f"Chunk texts stored: s3://{S3_JSON_FALLBACK_BUCKET}/{chunk_texts_key}")
        return chunk_texts_key

    except Exception as e:
        print(f"ERROR storing chunk texts: {e}")
        # Don't fail vectorization if this fails
        return None


def store_vectors_as_json(vectors_data, document_id, user_id):
    """Store vectors as JSON in S3 fallback bucket with detailed logging"""
    print("=== JSON FALLBACK STORAGE DEBUG ===")
    print(f"Target bucket: {S3_JSON_FALLBACK_BUCKET}")
    print(f"Document ID: {document_id}")
    print(f"User ID: {user_id}")

    try:
        # Test bucket access first
        print(f"Testing bucket access for: {S3_JSON_FALLBACK_BUCKET}")
        try:
            s3_client.head_bucket(Bucket=S3_JSON_FALLBACK_BUCKET)
            print("Bucket access test: SUCCESS")
        except ClientError as e:
            print(f"Bucket access test FAILED: {e}")
            raise e

        vector_storage_key = f"vectors/{user_id}/{document_id}.json"
        print(f"Storage key: {vector_storage_key}")

        # Create searchable index structure
        vector_index_data = {
            "document_id": document_id,
            "user_id": user_id,
            "vectors": vectors_data,
            "vector_count": len(vectors_data),
            "embedding_model": EMBEDDING_MODEL_ID,
            "created_at": datetime.utcnow().isoformat(),
            "searchable_chunks": [
                {
                    "chunk_id": v["chunk_id"],
                    "text_preview": v["metadata"].get(
                        "text_preview", v["text"][:200] + "..."
                    ),
                    "pages": v["metadata"].get("pages", "1"),
                    "content_type": v["metadata"].get("content_type", "text"),
                }
                for v in vectors_data
            ],
        }

        print(f"Attempting to store {len(vectors_data)} vectors to S3...")

        s3_client.put_object(
            Bucket=S3_JSON_FALLBACK_BUCKET,
            Key=vector_storage_key,
            Body=json.dumps(vector_index_data, indent=2),
            ContentType="application/json",
            Metadata={
                "document-id": document_id,
                "user-id": user_id,
                "vector-count": str(len(vectors_data)),
            },
        )

        print(
            f"JSON storage SUCCESS: s3://{S3_JSON_FALLBACK_BUCKET}/{vector_storage_key}"
        )
        return vector_storage_key

    except Exception as e:
        print(f"JSON storage FAILED: {e}")
        print(f"Error type: {type(e)}")
        print(f"Error details: {str(e)}")
        raise e


def try_s3_vectors_storage(vectors_data):
    """Try S3 Vectors API with batching and detailed debugging"""
    print("=== S3 VECTORS STORAGE ATTEMPT ===")
    s3_vectors_client = boto3.client("s3vectors", region_name=REGION_NAME)

    try:
        # Format vectors according to S3 Vectors schema requirements
        formatted_vectors = []

        for i, v in enumerate(vectors_data):
            print(f"--- Processing vector {i} for S3 Vectors ---")

            # Debug the original metadata
            original_metadata = v["metadata"]
            print(
                f"Original metadata keys ({len(original_metadata)}): {list(original_metadata.keys())}"
            )

            # Ensure all metadata values are strings and limit to 10 keys
            clean_metadata = {}
            for key, value in original_metadata.items():
                if isinstance(value, (list, dict)):
                    clean_metadata[key] = str(value)
                else:
                    clean_metadata[key] = str(value)

            # CRITICAL: Ensure we don't exceed 10 metadata keys
            if len(clean_metadata) > 10:
                print(
                    f"CRITICAL: Metadata has {len(clean_metadata)} keys, truncating to 10"
                )
                clean_metadata = dict(list(clean_metadata.items())[:10])

            print(
                f"Final metadata keys ({len(clean_metadata)}): {list(clean_metadata.keys())}"
            )

            vector_data = {
                "key": v["chunk_id"],
                "data": {"float32": v["vector"]},
                "metadata": clean_metadata,
            }
            formatted_vectors.append(vector_data)

            # Debug specific chunk that was failing
            if "chunk_011" in v["chunk_id"]:
                print("=== DEBUGGING CHUNK_011 ===")
                print(f"Chunk ID: {v['chunk_id']}")
                print(f"Metadata: {clean_metadata}")
                print(f"Vector dimensions: {len(v['vector'])}")
                print("=== END CHUNK_011 DEBUG ===")

        print(f"Formatted {len(formatted_vectors)} vectors for S3 Vectors API")

        # BATCH PROCESSING: S3 Vectors API limit is 500 vectors, but payload size also matters
        # Using smaller batches (100) to avoid payload size limits with large metadata
        batch_size = 100
        total_stored = 0

        print("=== STARTING BATCH PROCESSING ===")
        print(f"Total vectors: {len(formatted_vectors)}, Batch size: {batch_size}")

        for i in range(0, len(formatted_vectors), batch_size):
            batch = formatted_vectors[i : i + batch_size]
            batch_num = i // batch_size + 1

            print(f"--- Processing Batch {batch_num} ---")
            print(f"Batch size: {len(batch)} vectors")
            print(f"Sample batch metadata keys: {list(batch[0]['metadata'].keys())}")
            print(f"Sample batch key: {batch[0]['key']}")

            s3_vectors_client.put_vectors(
                vectorBucketName=S3_VECTORS_BUCKET,
                indexName=S3_VECTOR_INDEX_NAME,
                vectors=batch,
            )

            total_stored += len(batch)
            print(f"Batch {batch_num} SUCCESS: {len(batch)} vectors stored")
            print(f"Total stored so far: {total_stored}")

        print("=== S3 VECTORS STORAGE COMPLETE ===")
        print(f"Total vectors stored: {total_stored}")
        return True

    except Exception as e:
        print("=== S3 VECTORS STORAGE FAILED ===")
        print(f"Error: {str(e)}")
        print(f"Error type: {type(e)}")

        # Enhanced debug information
        if formatted_vectors:
            sample_vector = formatted_vectors[0]
            print("Sample vector debug:")
            print(f"  Key: {sample_vector['key']}")
            print(f"  Data type: {type(sample_vector['data']['float32'])}")
            print(f"  Vector dimensions: {len(sample_vector['data']['float32'])}")
            print(f"  Metadata count: {len(sample_vector['metadata'])}")
            print(f"  Metadata keys: {list(sample_vector['metadata'].keys())}")

            # Check if any vectors have > 10 metadata keys
            for i, v in enumerate(formatted_vectors):
                if len(v["metadata"]) > 10:
                    print(f"ERROR: Vector {i} has {len(v['metadata'])} metadata keys!")
                    print(f"  Vector key: {v['key']}")
                    print(f"  Metadata keys: {list(v['metadata'].keys())}")

        return False


def update_document_status(
    document_id, status, storage_location, chunks_count, storage_method
):
    """Update DynamoDB metadata table with vectorization status"""
    try:
        print("=== UPDATING DYNAMODB STATUS ===")
        print(f"Document ID: {document_id}")
        print(f"Status: {status}")
        print(f"Storage location: {storage_location}")
        print(f"Chunks: {chunks_count}")
        print(f"Storage method: {storage_method}")

        dynamodb_client.update_item(
            TableName=METADATA_TABLE,
            Key={"document_id": {"S": document_id}},
            UpdateExpression="SET #status = :status, vector_storage_location = :location, vector_count = :count, vectorized_at = :timestamp, storage_method = :method",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": {"S": status},
                ":location": {"S": storage_location},
                ":count": {"N": str(chunks_count)},
                ":timestamp": {"S": datetime.utcnow().isoformat()},
                ":method": {"S": storage_method},
            },
        )
        print(f"DynamoDB update SUCCESS for document {document_id}")
        return True
    except Exception as e:
        print(f"DynamoDB update FAILED: {e}")
        print(f"Error type: {type(e)}")
        import traceback

        print(f"Traceback: {traceback.format_exc()}")
        # Don't raise - vectorization still succeeded even if DB update failed
        return False


def publish_vectorization_complete(
    document_id: str, user_id: str, filename: str, vector_count: int
):
    """Publish SNS event to trigger auto-summary generation"""
    if not VECTORIZATION_COMPLETE_TOPIC:
        print("No VECTORIZATION_COMPLETE_TOPIC configured, skipping SNS publish")
        return

    try:
        message = {
            "document_id": document_id,
            "user_id": user_id,
            "filename": filename,
            "vector_count": vector_count,
            "status": "vectorized",
            "timestamp": datetime.utcnow().isoformat(),
        }

        print(
            f"Publishing vectorization-complete event to SNS: {VECTORIZATION_COMPLETE_TOPIC}"
        )
        print(f"Message: {json.dumps(message)}")

        response = sns_client.publish(
            TopicArn=VECTORIZATION_COMPLETE_TOPIC, Message=json.dumps(message)
        )

        print(f"SNS publish successful: MessageId={response.get('MessageId')}")

    except Exception as e:
        print(f"WARNING: Failed to publish SNS event: {e}")
        # Don't fail the vectorization if SNS publish fails
        import traceback

        print(f"Traceback: {traceback.format_exc()}")


def lambda_handler(event, context):
    """Main Lambda handler with comprehensive debugging"""

    print("=== ENHANCED VECTORIZATION FUNCTION v4.0 ===")
    print_config()

    # Parse input event
    try:
        if "Records" in event:
            if "eventBridge" in str(event) or "detail" in event.get("Records", [{}])[0]:
                detail = event["detail"]
                bucket_name = detail["bucket"]["name"]
                s3_key = detail["object"]["key"]
            else:
                s3_event = event["Records"][0]["s3"]
                bucket_name = s3_event["bucket"]["name"]
                s3_key = urllib.parse.unquote_plus(s3_event["object"]["key"])
        elif "detail" in event:
            bucket_name = event["detail"]["bucket"]["name"]
            s3_key = event["detail"]["object"]["key"]
        else:
            bucket_name = event.get("bucket_name", PROCESSED_BUCKET)
            s3_key = event.get("s3_key")
            if not s3_key:
                raise ValueError("s3_key required for direct invocation")
    except Exception as e:
        print(f"Error parsing event: {e}")
        return {
            "statusCode": 400,
            "body": json.dumps({"error": f"Invalid event format: {e}"}),
        }

    try:
        print(f"Processing document: s3://{bucket_name}/{s3_key}")

        # Read the processed document from S3
        file_content = (
            s3_client.get_object(Bucket=bucket_name, Key=s3_key)["Body"]
            .read()
            .decode("utf-8")
        )
        processed_data = json.loads(file_content)

        # Extract document information
        document_id = processed_data["document_id"]
        user_id = processed_data["user_id"]
        filename = processed_data.get("original_filename", "unknown.pdf")
        raw_text = processed_data.get("raw_text", "")
        page_texts = processed_data.get("page_texts", {})

        if not raw_text:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "No text content found"}),
            }

        print(f"Document {document_id}: {len(raw_text)} characters")

        # Intelligent text chunking
        text_chunks = intelligent_chunk_text(raw_text)
        print(f"Created {len(text_chunks)} chunks")

        # Process chunks and create vectors
        vectors_data = []
        successful_chunks = 0
        total_estimated_cost = 0

        for i, chunk in enumerate(text_chunks):
            try:
                print(f"Processing chunk {i+1}/{len(text_chunks)}")

                # Generate embedding
                vector_embedding = get_vector_embeddings(chunk)

                # Cost estimation
                estimated_tokens = len(chunk) / 3.3
                chunk_cost = (estimated_tokens / 1000000) * 0.10
                total_estimated_cost += chunk_cost

                # Determine pages
                chunk_pages = determine_chunk_pages(chunk, page_texts)

                # Create metadata with strict key limit
                chunk_metadata = create_chunk_metadata(
                    chunk, i, processed_data, chunk_pages
                )

                # Generate unique chunk ID
                chunk_id = f"{document_id}_chunk_{i:03d}"

                # Store vector data
                vector_data = {
                    "chunk_id": chunk_id,
                    "vector": vector_embedding,
                    "metadata": chunk_metadata,
                    "text": chunk,  # Keep full text for fallback search
                }

                vectors_data.append(vector_data)
                successful_chunks += 1

            except Exception as e:
                print(f"Error processing chunk {i}: {e}")
                continue

        if not vectors_data:
            return {
                "statusCode": 500,
                "body": json.dumps({"error": "No vectors generated successfully"}),
            }

        # Try S3 Vectors first, fallback to JSON storage
        s3_vectors_success = try_s3_vectors_storage(vectors_data)

        storage_location = ""
        if s3_vectors_success:
            storage_location = (
                f"s3vectors://{S3_VECTORS_BUCKET}/index/{S3_VECTOR_INDEX_NAME}"
            )
            storage_method = "S3 Vectors API"
            # Full chunk_text is stored in non-filterable metadata - no separate storage needed
            print("Full chunk text stored in vector metadata (non-filterable)")
        else:
            print("S3 Vectors failed, using JSON fallback...")
            json_key = store_vectors_as_json(vectors_data, document_id, user_id)
            storage_location = f"s3://{S3_JSON_FALLBACK_BUCKET}/{json_key}"
            storage_method = "S3 JSON fallback"

        print(f"Successfully stored {successful_chunks} vectors using {storage_method}")
        print(f"Estimated cost: ${total_estimated_cost:.6f}")

        # Update DynamoDB with vectorization status
        update_document_status(
            document_id=document_id,
            status="vectorized",
            storage_location=storage_location,
            chunks_count=successful_chunks,
            storage_method=storage_method,
        )

        # Publish SNS event to trigger auto-summary generation
        publish_vectorization_complete(
            document_id=document_id,
            user_id=user_id,
            filename=filename,
            vector_count=successful_chunks,
        )

        return {
            "statusCode": 200,
            "body": json.dumps(
                {
                    "message": "Document vectorized successfully",
                    "document_id": document_id,
                    "user_id": user_id,
                    "chunks_processed": successful_chunks,
                    "chunks_failed": len(text_chunks) - successful_chunks,
                    "storage_location": storage_location,
                    "storage_method": storage_method,
                    "embedding_model": EMBEDDING_MODEL_ID,
                    "estimated_cost_usd": round(total_estimated_cost, 6),
                }
            ),
        }

    except Exception as e:
        print(f"Error in Enhanced Vectorization Lambda v4.0: {e}")
        import traceback

        print(f"Full traceback: {traceback.format_exc()}")
        return {
            "statusCode": 500,
            "body": json.dumps(
                {
                    "error": str(e),
                    "document_key": s3_key if "s3_key" in locals() else "unknown",
                    "version": "4.0",
                }
            ),
        }
