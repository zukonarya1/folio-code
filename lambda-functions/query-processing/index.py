"""
QueryProcessingFunction - Version 2.0
Previous (v1.0):
- Initial implementation with complete query processing pipeline
- S3 Vectors integration for semantic similarity search
- Bedrock Cohere embedding generation with proper error handling
- User data isolation and document filtering
- Study guide vs custom query optimization
- DynamoDB query logging with TTL auto-cleanup
- Comprehensive debug logging for resource tracking
- Input validation and sanitization
- Cost estimation and performance monitoring
Author: Assistant
Date: 2025-11-21
"""

import json
import re
import boto3
import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Print function startup info for debugging
print("QueryProcessingFunction v2.0 starting up")
print(f"Region: {os.environ.get('REGION_NAME', 'us-west-2')}")
print(f"S3 Vectors Bucket: {os.environ.get('S3_VECTORS_BUCKET', 'NOT_SET')}")
print(f"Vector Index: {os.environ.get('S3_VECTOR_INDEX_NAME', 'NOT_SET')}")
print(f"Query Logs Table: {os.environ.get('QUERY_LOGS_TABLE', 'NOT_SET')}")
print(f"Metadata Table: {os.environ.get('METADATA_TABLE', 'NOT_SET')}")

# Initialize AWS clients
bedrock_client = boto3.client("bedrock-runtime")
s3vectors_client = boto3.client("s3vectors")
dynamodb = boto3.resource("dynamodb")
s3_client = boto3.client("s3")

# Environment variables
S3_VECTORS_BUCKET = os.environ.get(
    "S3_VECTORS_BUCKET", "pdf-conversation-vectors-198945929229"
)
S3_VECTOR_INDEX_NAME = os.environ.get("S3_VECTOR_INDEX_NAME", "document-chunks-index")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "cohere.embed-multilingual-v3")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")
QUERY_LOGS_TABLE = os.environ.get("QUERY_LOGS_TABLE", "pdf-conversation-query-logs")
METADATA_TABLE = os.environ.get("METADATA_TABLE", "pdf-conversation-metadata")
DEFAULT_SIMILARITY_THRESHOLD = float(
    os.environ.get("DEFAULT_SIMILARITY_THRESHOLD", "0.7")
)
MAX_RESULTS_LIMIT = int(os.environ.get("MAX_RESULTS_LIMIT", "20"))
MAX_CONTEXT_CHARS = int(os.environ.get("MAX_CONTEXT_CHARS", "50000"))


def lambda_handler(event, context):
    """
    Main query processing pipeline
    Input: API Gateway event with query parameters
    Output: Ranked list of relevant document chunks for RAG processing
    """
    start_time = time.time()
    query_id = str(uuid.uuid4())

    print("=== NEW QUERY REQUEST ===")
    print(f"Query ID: {query_id}")
    print(f"Event received: {json.dumps(event, default=str)[:500]}...")

    try:
        # STEP 1: INPUT VALIDATION AND PARSING
        print("STEP 1: Extracting and validating input")
        request_data = extract_and_validate_input(event)

        user_query = request_data["query"]
        user_id = request_data["user_id"]
        query_type = request_data.get("query_type", "custom_query")
        if query_type == "generate_summary":
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps(
                    {
                        "error": "generate_summary is no longer supported. Summaries are generated automatically after upload.",
                    }
                ),
            }
        document_filters = request_data.get("document_filters", {})
        similarity_threshold = request_data.get(
            "similarity_threshold", DEFAULT_SIMILARITY_THRESHOLD
        )
        max_results = request_data.get("max_results", 10)

        print(
            f"Parsed input - User: {user_id}, Query: '{user_query[:100]}...', Type: {query_type}"
        )
        print(
            f"Search params - Threshold: {similarity_threshold}, Max results: {max_results}"
        )

        # Log query attempt
        log_query_attempt(query_id, user_id, query_type, len(user_query))

        # STEP 2: QUERY PREPROCESSING
        print("STEP 2: Preprocessing query")
        cleaned_query = preprocess_query_text(user_query)

        if query_type == "study_guide":
            optimized_query = create_study_guide_query(cleaned_query)
            print(f"Created study guide query: '{optimized_query[:100]}...'")
        else:
            optimized_query = cleaned_query
            print(f"Using cleaned query: '{optimized_query}'")

        # STEP 3: GENERATE QUERY EMBEDDING
        print("STEP 3: Generating embedding using Bedrock")
        print(f"Bedrock model: {BEDROCK_MODEL_ID}")
        try:
            query_embedding = generate_query_embedding(optimized_query)
            print(
                f"Successfully generated embedding with {len(query_embedding)} dimensions"
            )
        except Exception as e:
            print(f"ERROR: Embedding generation failed: {str(e)}")
            logger.error(f"Embedding generation failed: {str(e)}")
            return error_response("Failed to process query", 500)

        # STEP 4: VECTOR SIMILARITY SEARCH
        print("STEP 4: Performing vector similarity search")
        print(f"S3 Vectors bucket: {S3_VECTORS_BUCKET}")
        print(f"S3 Vectors index: {S3_VECTOR_INDEX_NAME}")
        search_results = perform_vector_search(
            query_embedding,
            user_id,
            document_filters,
            min(
                max_results * 2, 100
            ),  # Retrieve more for filtering, but S3 Vectors max is 100
        )

        if not search_results:
            print("WARNING: No vector search results found for query")
            logger.info(f"No vector search results for query: {user_query}")
            return success_response(
                {
                    "query": user_query,
                    "query_type": query_type,
                    "total_results": 0,
                    "results": [],
                    "processing_metadata": create_processing_metadata(
                        query_id, start_time, len(query_embedding)
                    ),
                }
            )

        print(f"Found {len(search_results)} initial search results")

        # STEP 5: RESULT FILTERING AND RANKING
        print("STEP 5: Filtering and ranking results")
        filtered_results = filter_and_rank_results(
            search_results, similarity_threshold, max_results
        )

        print(
            f"After filtering: {len(filtered_results)} results above threshold {similarity_threshold}"
        )

        # STEP 6: RESULT ENRICHMENT
        print("STEP 6: Enriching results with metadata")
        enriched_results = enrich_results(filtered_results, query_type, user_id)

        # STEP 8: RESPONSE FORMATTING
        print("STEP 8: Formatting response")
        response_data = {
            "query": user_query,
            "query_type": query_type,
            "total_results": len(enriched_results),
            "similarity_threshold": similarity_threshold,
            "results": enriched_results,
            "processing_metadata": create_processing_metadata(
                query_id, start_time, len(query_embedding)
            ),
        }

        print(
            f"Final response: {len(enriched_results)} results, processing time: {response_data['processing_metadata']['search_time_ms']}ms"
        )

        # Log successful completion
        log_query_completion(
            query_id,
            user_id,
            len(enriched_results),
            response_data["processing_metadata"],
        )

        print("=== QUERY COMPLETED SUCCESSFULLY ===")
        return success_response(response_data)

    except ValueError as e:
        print(f"ERROR: Input validation failed: {str(e)}")
        logger.error(f"Input validation error: {str(e)}")
        return error_response(str(e), 400)
    except Exception as e:
        print(f"ERROR: Unexpected error in query processing: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        logger.error(f"Unexpected error in query processing: {str(e)}")
        log_query_error(query_id, str(e))
        return error_response("Internal server error", 500)


def extract_and_validate_input(event: Dict) -> Dict:
    """Extract and validate input parameters from API Gateway event"""
    try:
        if "body" not in event:
            raise ValueError("Missing request body")

        if isinstance(event["body"], str):
            body = json.loads(event["body"])
        else:
            body = event["body"]

        # Required fields
        if "query" not in body or not body["query"].strip():
            raise ValueError("Query parameter is required and cannot be empty")

        # Get user_id from Cognito claims (not from request body)
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        user_id = claims.get("sub", "")

        if not user_id:
            raise ValueError("User authentication failed - no user ID in token")

        # Add user_id to body for downstream processing
        body["user_id"] = user_id

        # Validate query length
        if len(body["query"]) > 1000:
            raise ValueError("Query exceeds maximum length of 1000 characters")

        # Validate similarity threshold
        threshold = body.get("similarity_threshold", DEFAULT_SIMILARITY_THRESHOLD)
        if not isinstance(threshold, (int, float)) or threshold < 0 or threshold > 1:
            raise ValueError("Similarity threshold must be between 0 and 1")

        # Validate max results
        max_results = body.get("max_results", 10)
        if (
            not isinstance(max_results, int)
            or max_results < 1
            or max_results > MAX_RESULTS_LIMIT
        ):
            raise ValueError(f"Max results must be between 1 and {MAX_RESULTS_LIMIT}")

        # Validate query type
        query_type = body.get("query_type", "custom_query")
        if query_type not in ["custom_query", "study_guide"]:
            raise ValueError("Query type must be 'custom_query' or 'study_guide'")

        return body

    except json.JSONDecodeError:
        raise ValueError("Invalid JSON in request body")


def preprocess_query_text(query: str) -> str:
    """Clean and optimize query text for embedding generation"""
    # Remove extra whitespace
    cleaned = " ".join(query.strip().split())

    # Remove potentially problematic characters but preserve meaning
    # Keep alphanumeric, spaces, common punctuation
    cleaned = re.sub(r"[^\w\s\-.,!?():]", " ", cleaned)

    # Collapse multiple spaces
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


def create_study_guide_query(user_query: str) -> str:
    """Create optimized query for comprehensive study guide generation"""
    template = f"""Create a comprehensive study overview covering: {user_query}
    Include key concepts, definitions, procedures, and practical applications.
    Focus on educational content suitable for learning and examination preparation."""
    return template.strip()


def generate_query_embedding(query_text: str) -> List[float]:
    """Generate embedding using same Cohere model as vectorization"""
    print(f"Generating embedding for query: '{query_text[:100]}...'")
    print(f"Using Bedrock model: {BEDROCK_MODEL_ID}")

    try:
        request_payload = {
            "texts": [query_text],
            "input_type": "search_query",  # Different from document embedding
        }
        print(f"Bedrock request payload: {json.dumps(request_payload)}")

        response = bedrock_client.invoke_model(
            body=json.dumps(request_payload), modelId=BEDROCK_MODEL_ID
        )

        result = json.loads(response["body"].read())
        print(f"Bedrock response structure: {list(result.keys())}")

        embedding = result["embeddings"][0]
        print(
            f"Embedding generated: {len(embedding)} dimensions, first 5 values: {embedding[:5]}"
        )

        # Validate embedding dimensions
        if len(embedding) != 1024:
            raise ValueError(f"Unexpected embedding dimension: {len(embedding)}")

        return embedding

    except Exception as e:
        print(f"ERROR in generate_query_embedding: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        logger.error(f"Bedrock embedding generation failed: {str(e)}")
        raise


def perform_vector_search(
    query_embedding: List[float], user_id: str, document_filters: Dict, max_results: int
) -> List[Dict]:
    """Query S3 Vectors index to find semantically similar document chunks"""
    print(f"Starting vector search for user: {user_id}")
    print(f"Target bucket: {S3_VECTORS_BUCKET}")
    print(f"Target index: {S3_VECTOR_INDEX_NAME}")
    print(f"Query vector dimensions: {len(query_embedding)}")
    print(f"Requesting topK: {min(max_results, 100)}")  # S3 Vectors max is 100

    try:
        # Prepare search parameters
        search_params = {
            "vectorBucketName": S3_VECTORS_BUCKET,
            "indexName": S3_VECTOR_INDEX_NAME,
            "queryVector": {"float32": query_embedding},
            "topK": min(max_results, 100),  # S3 Vectors max is 100
            "returnDistance": True,
            "returnMetadata": True,
        }

        # Apply filters if specified
        filter_conditions = []

        if user_id:
            filter_conditions.append({"user_id": user_id})
            print(f"Applied user filter: {user_id}")

        if document_filters and "document_id" in document_filters:
            filter_conditions.append({"document_id": document_filters["document_id"]})
            print(f"Applied document_id filter: {document_filters['document_id']}")

        if filter_conditions:
            if len(filter_conditions) == 1:
                search_params["filter"] = filter_conditions[0]
            else:
                search_params["filter"] = {"$and": filter_conditions}
            print(f"Final filters applied: {json.dumps(search_params['filter'])}")

        print(
            f"S3 Vectors search parameters: {json.dumps(search_params, default=str)[:300]}..."
        )

        response = s3vectors_client.query_vectors(**search_params)

        print(f"S3 Vectors search response keys: {list(response.keys())}")
        results = response.get("vectors", [])
        print(f"Vector search returned {len(results)} results")

        # Log sample result for debugging
        if results:
            sample = results[0]
            print(f"Sample result structure: {list(sample.keys())}")
            print(f"Sample result key: {sample.get('key', 'NO_KEY')}")
            print(f"Sample distance: {sample.get('distance', 'NO_DISTANCE')}")
            print(f"Sample metadata keys: {list(sample.get('metadata', {}).keys())}")

        return results

    except Exception as e:
        print(f"ERROR in perform_vector_search: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        print(f"Search params that failed: {json.dumps(search_params, default=str)}")
        logger.error(f"S3 Vectors search failed: {str(e)}")
        # Could implement fallback to JSON vector search here if needed
        return []


def filter_and_rank_results(
    search_results: List[Dict], similarity_threshold: float, max_results: int
) -> List[Dict]:
    """Apply similarity threshold and business logic filters"""
    filtered_results = []

    for result in search_results:
        # Convert distance to similarity score (cosine distance -> cosine similarity)
        similarity_score = 1 - result.get("distance", 1.0)

        # Apply similarity threshold
        if similarity_score >= similarity_threshold:
            # Extract and validate metadata
            metadata = result.get("metadata", {})

            chunk_data = {
                "chunk_id": result["key"],
                "similarity_score": round(similarity_score, 4),
                "document_id": metadata.get("document_id", "unknown"),
                "filename": metadata.get("filename", "unknown"),
                "chunk_index": int(metadata.get("chunk_index", 0)),
                "content_type": metadata.get("content_type", "text"),
                "pages": metadata.get("pages", "unknown"),
                "chunk_text": metadata.get(
                    "chunk_text", metadata.get("text_preview", "")
                ),  # Full text for RAG
                "text_preview": (
                    (
                        metadata.get("chunk_text", metadata.get("text_preview", ""))[
                            :200
                        ]
                        + "..."
                    )
                    if len(metadata.get("chunk_text", metadata.get("text_preview", "")))
                    > 200
                    else metadata.get("chunk_text", metadata.get("text_preview", ""))
                ),
            }

            # Apply content quality filters
            if passes_content_quality_check(chunk_data):
                filtered_results.append(chunk_data)

    # Sort by similarity score (highest first) and limit results
    ranked_results = sorted(
        filtered_results, key=lambda x: x["similarity_score"], reverse=True
    )
    return ranked_results[:max_results]


def passes_content_quality_check(chunk_data: Dict) -> bool:
    """Apply business logic filters for content quality"""
    # Filter out very short chunks (likely headers or fragments)
    if len(chunk_data["text_preview"]) < 20:
        return False

    # Could add more sophisticated content filtering here
    # e.g., filter by content type, language detection, etc.

    return True


def enrich_results(results: List[Dict], query_type: str, user_id: str) -> List[Dict]:
    """Add additional context and prepare for RAG processing"""
    enriched_results = []

    for result in results:
        # Add relevance explanation
        result["relevance_reason"] = generate_relevance_explanation(
            result["similarity_score"], result["content_type"]
        )

        # For study guide queries, optionally retrieve full text
        if query_type == "study_guide":
            # Could retrieve full chunk text here if needed
            # result['full_text'] = retrieve_full_chunk_text(result['chunk_id'], user_id)
            pass

        # Add document metadata from metadata table
        try:
            doc_metadata = get_document_metadata(result["document_id"])
            if doc_metadata:
                result["document_title"] = doc_metadata.get("title", result["filename"])
                result["upload_date"] = doc_metadata.get("created_at", "unknown")
        except Exception as e:
            logger.warning(f"Could not retrieve document metadata: {str(e)}")

        enriched_results.append(result)

    return enriched_results


def generate_relevance_explanation(similarity_score: float, content_type: str) -> str:
    """Generate human-readable relevance explanation"""
    if similarity_score >= 0.9:
        relevance = "Very high relevance"
    elif similarity_score >= 0.8:
        relevance = "High relevance"
    elif similarity_score >= 0.7:
        relevance = "Good relevance"
    else:
        relevance = "Moderate relevance"

    return f"{relevance} match (score: {similarity_score:.2f})"


def get_document_metadata(document_id: str) -> Optional[Dict]:
    """Retrieve document metadata from DynamoDB"""
    try:
        table = dynamodb.Table(METADATA_TABLE)
        response = table.get_item(Key={"document_id": document_id})
        return response.get("Item")
    except Exception as e:
        logger.warning(
            f"Could not retrieve metadata for document {document_id}: {str(e)}"
        )
        return None


def create_processing_metadata(
    query_id: str, start_time: float, embedding_dimensions: int
) -> Dict:
    """Create processing metadata for response"""
    processing_time = time.time() - start_time

    return {
        "query_id": query_id,
        "query_embedding_dimensions": embedding_dimensions,
        "search_time_ms": round(processing_time * 1000, 2),
        "cost_estimate_usd": calculate_query_cost(),
        "timestamp": datetime.utcnow().isoformat(),
    }


def calculate_query_cost() -> float:
    """Calculate estimated cost for this query"""
    # Rough cost estimates (adjust based on actual pricing)
    bedrock_cost = 0.0001  # ~$0.10 per 1M tokens, assuming ~1000 tokens
    s3vectors_cost = 0.001  # Estimated S3 Vectors query cost
    lambda_cost = 0.00002  # Minimal Lambda cost

    return round(bedrock_cost + s3vectors_cost + lambda_cost, 6)


def log_query_attempt(query_id: str, user_id: str, query_type: str, query_length: int):
    """Log query attempt for monitoring"""
    logger.info(
        f"Query attempt: {query_id}, user: {user_id}, type: {query_type}, length: {query_length}"
    )


def log_query_completion(
    query_id: str, user_id: str, results_count: int, metadata: Dict
):
    """Log successful query completion"""
    print(f"Logging query completion to DynamoDB table: {QUERY_LOGS_TABLE}")
    print(f"Query ID: {query_id}, User: {user_id}, Results: {results_count}")

    try:
        # Log to DynamoDB if table exists
        table = dynamodb.Table(QUERY_LOGS_TABLE)

        log_item = {
            "query_id": query_id,
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "results_count": results_count,
            "processing_time_ms": metadata["search_time_ms"],
            "cost_estimate": metadata["cost_estimate_usd"],
            "status": "success",
            "ttl": int(
                (datetime.utcnow() + timedelta(days=30)).timestamp()
            ),  # Auto-delete after 30 days
        }

        print(f"DynamoDB log item: {json.dumps(log_item, default=str)}")

        response = table.put_item(Item=log_item)
        print(f"DynamoDB put_item response: {response}")

        logger.info(
            f"Query completed successfully: {query_id}, results: {results_count}"
        )
        print("Successfully logged query completion to DynamoDB")

    except Exception as e:
        # Don't fail the query if logging fails
        print(f"WARNING: Could not log query completion: {str(e)}")
        print(f"DynamoDB error type: {type(e).__name__}")
        logger.warning(f"Could not log query completion: {str(e)}")


def log_query_error(query_id: str, error_message: str):
    """Log query error for debugging"""
    print(f"Logging query error to DynamoDB table: {QUERY_LOGS_TABLE}")
    print(f"Query ID: {query_id}, Error: {error_message}")

    try:
        table = dynamodb.Table(QUERY_LOGS_TABLE)

        log_item = {
            "query_id": query_id,
            "timestamp": datetime.utcnow().isoformat(),
            "status": "error",
            "error_message": error_message,
            "ttl": int((datetime.utcnow() + timedelta(days=30)).timestamp()),
        }

        print(f"DynamoDB error log item: {json.dumps(log_item, default=str)}")

        response = table.put_item(Item=log_item)
        print(f"DynamoDB put_item error response: {response}")
        print("Successfully logged error to DynamoDB")

    except Exception as e:
        print(f"WARNING: Could not log query error: {str(e)}")
        print(f"DynamoDB error logging failed with type: {type(e).__name__}")
        logger.warning(f"Could not log query error: {str(e)}")


def success_response(data: Dict) -> Dict:
    """Format successful response"""
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(data, default=str),
    }


def error_response(message: str, status_code: int) -> Dict:
    """Format error response"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,x-api-key",
            "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        "body": json.dumps(
            {"error": message, "timestamp": datetime.utcnow().isoformat()}
        ),
    }
