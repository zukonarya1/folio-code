import json
import boto3
import os
from datetime import datetime

# Environment variables
DIGESTS_BUCKET = os.environ.get("DIGESTS_BUCKET", "pdf-conversation-digests")
METADATA_TABLE = os.environ.get("METADATA_TABLE", "pdf-conversation-metadata")
REGION_NAME = os.environ.get("REGION_NAME", "us-west-2")

# Initialize AWS clients
textract = boto3.client("textract", region_name=REGION_NAME)
s3 = boto3.client("s3", region_name=REGION_NAME)
dynamodb = boto3.resource("dynamodb", region_name=REGION_NAME)
table = dynamodb.Table(METADATA_TABLE)


def get_document_metadata_from_dynamodb(job_id):
    """Get document metadata using textract job ID"""
    try:
        # Query by textract_job_id (you may need to add a GSI for this)
        response = table.scan(
            FilterExpression="textract_job_id = :job_id",
            ExpressionAttributeValues={":job_id": job_id},
        )

        if response["Items"]:
            return response["Items"][0]

        print(f"No document metadata found for job_id: {job_id}")
        return None

    except Exception as e:
        print(f"Error retrieving document metadata: {e}")
        return None


def update_document_status(
    document_id, status, processing_metadata=None, error_details=None
):
    """Update document processing status in DynamoDB"""
    try:
        update_expression = "SET #status = :status, completed_at = :completed_at"
        expression_attribute_names = {"#status": "status"}
        expression_attribute_values = {
            ":status": status,
            ":completed_at": datetime.utcnow().isoformat(),
        }

        if processing_metadata:
            update_expression += ", processing_metadata = :metadata"
            expression_attribute_values[":metadata"] = processing_metadata

        if error_details:
            update_expression += ", error_details = :error"
            expression_attribute_values[":error"] = error_details

        table.update_item(
            Key={"document_id": document_id},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
        )

        print(f"Updated document {document_id} status to {status}")
        return True

    except Exception as e:
        print(f"Error updating document status: {e}")
        return False


def extract_document_metadata(job_id, textract_response):
    """Extract metadata about the document from Textract response"""
    metadata = {
        "job_id": job_id,
        "processed_at": datetime.utcnow().isoformat(),
        "page_count": 0,
        "word_count": 0,
        "line_count": 0,
        "table_count": 0,
        "form_count": 0,
    }

    pages = set()
    words = 0
    lines = 0
    tables = 0
    forms = 0

    for block in textract_response.get("Blocks", []):
        block_type = block["BlockType"]

        if block_type == "PAGE":
            pages.add(block.get("Page", 1))
        elif block_type == "WORD":
            words += 1
        elif block_type == "LINE":
            lines += 1
        elif block_type == "TABLE":
            tables += 1
        elif block_type == "KEY_VALUE_SET":
            forms += 1

    metadata.update(
        {
            "page_count": len(pages),
            "word_count": words,
            "line_count": lines,
            "table_count": tables,
            "form_count": forms,
        }
    )

    return metadata


def extract_text_content(textract_response):
    """Extract all text content from Textract response"""
    page_texts = {}

    for block in textract_response.get("Blocks", []):
        if block["BlockType"] == "LINE":
            page_num = block.get("Page", 1)
            if page_num not in page_texts:
                page_texts[page_num] = []
            page_texts[page_num].append(block.get("Text", ""))

    # Combine all text in page order
    all_text = ""
    for page_num in sorted(page_texts.keys()):
        page_text = "\n".join(page_texts[page_num])
        all_text += f"\n--- Page {page_num} ---\n{page_text}\n"

    return all_text.strip(), page_texts


def extract_tables(textract_response):
    """Extract table data from Textract response - simplified for now"""
    tables = []

    for block in textract_response.get("Blocks", []):
        if block["BlockType"] == "TABLE":
            tables.append(
                {
                    "table_id": block["Id"],
                    "page": block.get("Page", 1),
                    "confidence": block.get("Confidence", 0),
                    "geometry": block.get("Geometry", {}),
                    "rows": 0,  # Will be enhanced later
                    "columns": 0,
                    "data": [],
                }
            )

    return tables


def extract_forms(textract_response):
    """Extract form data from Textract response - simplified for now"""
    forms = {}
    key_value_count = 0

    for block in textract_response.get("Blocks", []):
        if block["BlockType"] == "KEY_VALUE_SET":
            key_value_count += 1

    if key_value_count > 0:
        forms["total_key_value_pairs"] = key_value_count

    return forms


def lambda_handler(event, context):
    """
    Process Textract completion notifications from SNS
    """
    try:
        print(f"Processing SNS event: {json.dumps(event, indent=2)}")

        # Parse SNS message
        if "Records" in event:
            sns_record = event["Records"][0]["Sns"]
            message = json.loads(sns_record["Message"])
        else:
            # Direct invocation for testing
            message = event

        job_id = message.get("JobId")
        job_status = message.get("Status")
        job_tag = message.get("JobTag")  # This should be our document_id

        if not job_id:
            raise ValueError("JobId not found in SNS message")

        print(
            f"Processing Textract job: {job_id}, Status: {job_status}, Tag: {job_tag}"
        )

        # Get document metadata from DynamoDB
        doc_metadata = get_document_metadata_from_dynamodb(job_id)
        if not doc_metadata:
            raise ValueError(f"No document metadata found for job_id: {job_id}")

        document_id = doc_metadata["document_id"]
        user_id = doc_metadata["user_id"]
        original_filename = doc_metadata["original_filename"]
        original_s3_location = doc_metadata["original_s3_location"]

        print(
            f"Processing document: {original_filename} (ID: {document_id}) for user: {user_id}"
        )

        # Handle job status
        if job_status == "SUCCEEDED":
            print("Textract job succeeded, retrieving results...")

            # Get Textract results with pagination handling
            textract_response = textract.get_document_text_detection(JobId=job_id)
            all_blocks = textract_response.get("Blocks", [])
            next_token = textract_response.get("NextToken")

            while next_token:
                print("Fetching additional results with NextToken")
                paginated_response = textract.get_document_text_detection(
                    JobId=job_id, NextToken=next_token
                )
                all_blocks.extend(paginated_response.get("Blocks", []))
                next_token = paginated_response.get("NextToken")

            textract_response["Blocks"] = all_blocks
            print(f"Retrieved {len(all_blocks)} total blocks from Textract")

            # Extract all content
            raw_text, page_texts = extract_text_content(textract_response)
            tables = extract_tables(textract_response)
            forms = extract_forms(textract_response)
            processing_metadata = extract_document_metadata(job_id, textract_response)

            # Create the final JSON structure
            processed_data = {
                "document_id": document_id,
                "user_id": user_id,
                "original_filename": original_filename,
                "original_s3_location": original_s3_location,
                "extraction_method": "detect_document_text",
                "processing_metadata": processing_metadata,
                "raw_text": raw_text,
                "page_texts": page_texts,
                "tables": tables,
                "forms": forms,
                "textract_job_id": job_id,
            }

            # Save to S3 digests bucket
            output_key = f"users/{user_id}/{document_id}.json"

            s3.put_object(
                Bucket=DIGESTS_BUCKET,
                Key=output_key,
                Body=json.dumps(processed_data, indent=2),
                ContentType="application/json",
                Metadata={
                    "original-filename": original_filename,
                    "document-id": document_id,
                    "user-id": user_id,
                },
            )

            print(f"Saved processed document to s3://{DIGESTS_BUCKET}/{output_key}")

            # Update status to completed
            update_document_status(document_id, "completed", processing_metadata)

            return {
                "statusCode": 200,
                "body": json.dumps(
                    {
                        "message": "Document processed successfully",
                        "document_id": document_id,
                        "output_location": f"s3://{DIGESTS_BUCKET}/{output_key}",
                        "stats": {
                            "pages": processing_metadata["page_count"],
                            "words": processing_metadata["word_count"],
                            "tables": processing_metadata["table_count"],
                            "forms": processing_metadata["form_count"],
                        },
                    }
                ),
            }

        elif job_status == "FAILED":
            error_details = (
                f"Textract job failed: {message.get('StatusMessage', 'Unknown error')}"
            )
            print(f"Textract job failed: {error_details}")

            # Update status to failed
            update_document_status(document_id, "failed", error_details=error_details)

            return {
                "statusCode": 500,
                "body": json.dumps(
                    {
                        "error": "Textract processing failed",
                        "document_id": document_id,
                        "details": error_details,
                    }
                ),
            }

        else:
            print(f"Unexpected job status: {job_status}")
            return {
                "statusCode": 200,
                "body": json.dumps(
                    {"message": f"Job status: {job_status}", "document_id": document_id}
                ),
            }

    except Exception as e:
        print(f"Error processing Textract results: {str(e)}")
        import traceback

        print(f"Full traceback: {traceback.format_exc()}")

        # Try to update status to failed if we have document_id
        if "document_id" in locals():
            update_document_status(document_id, "failed", error_details=str(e))

        return {
            "statusCode": 500,
            "body": json.dumps(
                {"error": str(e), "message": "Document processing failed"}
            ),
        }
