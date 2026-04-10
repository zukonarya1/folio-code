"""
S3 Vectors Setup Custom Resource Handler

This Lambda function manages S3 Vectors resources (vector buckets and indexes)
for CloudFormation custom resources. Since CDK doesn't have native S3 Vectors
support (preview service), this handler provides that functionality.

Author: Assistant
Date: 2025-11-20
"""

import boto3
import json
import logging
import urllib3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize HTTP client for CloudFormation responses
http = urllib3.PoolManager()


def send_cfn_response(
    event, context, response_status, response_data, physical_resource_id=None
):
    """
    Send response to CloudFormation.

    This replaces the cfnresponse module which is only available in inline Lambda code.
    """
    response_url = event["ResponseURL"]

    response_body = {
        "Status": response_status,
        "Reason": f"See CloudWatch Log Stream: {context.log_stream_name}",
        "PhysicalResourceId": physical_resource_id or context.log_stream_name,
        "StackId": event["StackId"],
        "RequestId": event["RequestId"],
        "LogicalResourceId": event["LogicalResourceId"],
        "Data": response_data,
    }

    json_response_body = json.dumps(response_body)

    logger.info(f"Response body: {json_response_body}")

    try:
        response = http.request(
            "PUT",
            response_url,
            body=json_response_body.encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        logger.info(f"CloudFormation response status: {response.status}")
    except Exception as e:
        logger.error(f"Failed to send response to CloudFormation: {e}")
        raise


def lambda_handler(event, context):
    """
    CloudFormation Custom Resource handler for S3 Vectors setup.

    Handles Create, Update, and Delete operations for:
    - S3 Vectors bucket
    - S3 Vectors index
    """

    logger.info(f"Received event: {json.dumps(event)}")

    request_type = event["RequestType"]
    properties = event["ResourceProperties"]

    # Extract properties
    vector_bucket_name = properties.get("VectorBucketName")
    index_name = properties.get("IndexName")
    dimension = int(properties.get("Dimension", 1024))
    distance_metric = properties.get("DistanceMetric", "cosine")
    region = properties.get("Region", "us-west-2")

    # Initialize S3 Vectors client
    s3vectors = boto3.client("s3vectors", region_name=region)

    try:
        if request_type == "Create":
            response_data = handle_create(
                s3vectors, vector_bucket_name, index_name, dimension, distance_metric
            )
            physical_resource_id = f"{vector_bucket_name}/{index_name}"

        elif request_type == "Update":
            response_data = handle_update(
                s3vectors, vector_bucket_name, index_name, dimension, distance_metric
            )
            physical_resource_id = event.get(
                "PhysicalResourceId", f"{vector_bucket_name}/{index_name}"
            )

        elif request_type == "Delete":
            response_data = handle_delete(s3vectors, vector_bucket_name, index_name)
            physical_resource_id = event.get(
                "PhysicalResourceId", f"{vector_bucket_name}/{index_name}"
            )

        logger.info(f"Operation {request_type} completed successfully")
        send_cfn_response(
            event, context, "SUCCESS", response_data, physical_resource_id
        )

    except Exception as e:
        logger.error(f"Error in {request_type}: {str(e)}")
        error_message = str(e)

        # Don't fail on delete if resources don't exist
        if request_type == "Delete" and "NotFoundException" in error_message:
            logger.info("Resources already deleted, treating as success")
            send_cfn_response(
                event, context, "SUCCESS", {"Message": "Resources already deleted"}
            )
        else:
            send_cfn_response(event, context, "FAILED", {"Error": error_message})


def handle_create(
    s3vectors, vector_bucket_name, index_name, dimension, distance_metric
):
    """
    Create S3 Vectors bucket and index.

    Configures chunk_text as non-filterable metadata to allow storing full text
    without hitting the 2KB filterable metadata limit.
    """

    # Step 1: Create Vector Bucket
    logger.info(f"Creating vector bucket: {vector_bucket_name}")

    try:
        s3vectors.create_vector_bucket(vectorBucketName=vector_bucket_name)
        logger.info(f"Vector bucket created: {vector_bucket_name}")
    except Exception as e:
        error_str = str(e)
        if "ConflictException" in error_str or "already exists" in error_str.lower():
            logger.info(f"Vector bucket already exists: {vector_bucket_name}")
        else:
            raise

    # Step 2: Create Vector Index with non-filterable metadata configuration
    logger.info(f"Creating vector index: {index_name}")
    logger.info(f"  Dimension: {dimension}")
    logger.info(f"  Distance metric: {distance_metric}")
    logger.info("  Non-filterable keys: ['chunk_text']")

    try:
        s3vectors.create_index(
            vectorBucketName=vector_bucket_name,
            indexName=index_name,
            dataType="float32",
            dimension=dimension,
            distanceMetric=distance_metric,
            metadataConfiguration={"nonFilterableMetadataKeys": ["chunk_text"]},
        )
        logger.info(f"Vector index created with non-filterable metadata: {index_name}")
    except Exception as e:
        error_str = str(e)
        if "ConflictException" in error_str or "already exists" in error_str.lower():
            logger.info(f"Vector index already exists: {index_name}")
        else:
            raise

    return {
        "VectorBucketName": vector_bucket_name,
        "IndexName": index_name,
        "Dimension": str(dimension),
        "DistanceMetric": distance_metric,
        "NonFilterableKeys": "chunk_text",
        "Message": "S3 Vectors resources created successfully with non-filterable metadata",
    }


def handle_update(
    s3vectors, vector_bucket_name, index_name, dimension, distance_metric
):
    """
    Recreate S3 Vectors index to migrate to GA API.

    Deletes existing index and all vectors, then recreates with same configuration.
    This is necessary for GA migration as index metadata configuration cannot be updated.
    """
    import time

    logger.info(f"Performing index recreation for GA migration: {index_name}")

    try:
        paginator_token = None
        while True:
            list_params = {
                "vectorBucketName": vector_bucket_name,
                "indexName": index_name,
            }
            if paginator_token:
                list_params["nextToken"] = paginator_token

            response = s3vectors.list_vectors(**list_params)

            if response.get("vectors"):
                keys = [v["key"] for v in response["vectors"]]
                batch_size = 500
                for i in range(0, len(keys), batch_size):
                    batch = keys[i : i + batch_size]
                    s3vectors.delete_vectors(
                        vectorBucketName=vector_bucket_name,
                        indexName=index_name,
                        keys=batch,
                    )
                    logger.info(f"Deleted {len(batch)} vectors")

            paginator_token = response.get("nextToken")
            if not paginator_token:
                break

    except Exception as e:
        logger.warning(f"Error listing/deleting vectors: {e}")

    try:
        s3vectors.delete_index(
            vectorBucketName=vector_bucket_name, indexName=index_name
        )
        logger.info(f"Deleted existing index: {index_name}")
    except Exception as e:
        if "NotFoundException" in str(e):
            logger.info(f"Index already deleted: {index_name}")
        else:
            logger.warning(f"Error deleting index: {e}")

    time.sleep(2)

    logger.info(f"Creating index with GA configuration: {index_name}")
    logger.info(f"  Dimension: {dimension}")
    logger.info(f"  Distance metric: {distance_metric}")
    logger.info("  Non-filterable keys: ['chunk_text']")

    attempt = 0
    while attempt < 2:
        try:
            s3vectors.create_index(
                vectorBucketName=vector_bucket_name,
                indexName=index_name,
                dataType="float32",
                dimension=dimension,
                distanceMetric=distance_metric,
                metadataConfiguration={"nonFilterableMetadataKeys": ["chunk_text"]},
            )
            logger.info(f"Index recreated successfully: {index_name}")
            break
        except Exception as e:
            error_str = str(e)
            if "ConflictException" in error_str and attempt == 0:
                logger.warning("ConflictException on create, waiting 5s and retrying")
                time.sleep(5)
                attempt += 1
            else:
                raise

    return {
        "VectorBucketName": vector_bucket_name,
        "IndexName": index_name,
        "Dimension": str(dimension),
        "DistanceMetric": distance_metric,
        "NonFilterableKeys": "chunk_text",
        "Message": "Index recreated successfully for GA migration",
    }


def handle_delete(s3vectors, vector_bucket_name, index_name):
    """
    Delete S3 Vectors index and bucket.

    Note: Index must be empty and deleted before bucket can be deleted.
    """

    # Step 1: Delete Vector Index
    logger.info(f"Deleting vector index: {index_name}")

    try:
        # First, list and delete all vectors in the index
        # This is required before deleting the index
        try:
            paginator_token = None
            while True:
                list_params = {
                    "vectorBucketName": vector_bucket_name,
                    "indexName": index_name,
                }
                if paginator_token:
                    list_params["nextToken"] = paginator_token

                response = s3vectors.list_vectors(**list_params)

                if response.get("vectors"):
                    keys = [v["key"] for v in response["vectors"]]
                    if keys:
                        s3vectors.delete_vectors(
                            vectorBucketName=vector_bucket_name,
                            indexName=index_name,
                            keys=keys,
                        )
                        logger.info(f"Deleted {len(keys)} vectors")

                paginator_token = response.get("nextToken")
                if not paginator_token:
                    break

        except Exception as e:
            logger.warning(f"Error clearing vectors: {e}")

        # Now delete the index
        s3vectors.delete_index(
            vectorBucketName=vector_bucket_name, indexName=index_name
        )
        logger.info(f"Vector index deleted: {index_name}")

    except Exception as e:
        if "NotFoundException" in str(e):
            logger.info(f"Vector index already deleted: {index_name}")
        else:
            logger.warning(f"Error deleting index: {e}")

    # Step 2: Delete Vector Bucket
    logger.info(f"Deleting vector bucket: {vector_bucket_name}")

    try:
        s3vectors.delete_vector_bucket(vectorBucketName=vector_bucket_name)
        logger.info(f"Vector bucket deleted: {vector_bucket_name}")

    except Exception as e:
        if "NotFoundException" in str(e):
            logger.info(f"Vector bucket already deleted: {vector_bucket_name}")
        else:
            logger.warning(f"Error deleting bucket: {e}")

    return {"Message": "S3 Vectors resources deleted successfully"}
