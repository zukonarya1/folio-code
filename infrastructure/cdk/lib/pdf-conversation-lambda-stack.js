"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PdfConversationLambdaStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const s3n = __importStar(require("aws-cdk-lib/aws-s3-notifications"));
const lambdaEventSources = __importStar(require("aws-cdk-lib/aws-lambda-event-sources"));
const path = __importStar(require("path"));
class PdfConversationLambdaStack extends cdk.Stack {
    documentIngestionFunction;
    textractProcessorFunction;
    textractResultsProcessorFunction;
    bedrockVectorizationFunction;
    queryProcessingFunction;
    constructor(scope, id, props) {
        super(scope, id, props);
        // 1. Document Ingestion Function - Triggered by S3 upload
        this.documentIngestionFunction = new lambda.Function(this, 'DocumentIngestionFunction', {
            functionName: 'DocumentIngestionFunction',
            runtime: lambda.Runtime.PYTHON_3_13,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/document-ingestion')),
            timeout: cdk.Duration.seconds(60),
            memorySize: 256,
            role: props.documentIngestionRole,
            environment: {
                METADATA_TABLE: props.metadataTable.tableName,
                SNS_TOPIC_ARN: props.textractCompletionTopic.topicArn,
                REGION_NAME: this.region,
            },
        });
        // S3 trigger for document ingestion
        props.processingBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(this.documentIngestionFunction), { suffix: '.pdf' });
        // 2. Textract Processor Function - Triggered by S3 upload
        this.textractProcessorFunction = new lambda.Function(this, 'TextractProcessorFunction', {
            functionName: 'TextractProcessorFunction',
            runtime: lambda.Runtime.PYTHON_3_13,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/textract-processor')),
            timeout: cdk.Duration.seconds(300),
            memorySize: 128,
            role: props.textractProcessorRole,
            environment: {
                SNS_TOPIC_ARN: props.textractCompletionTopic.topicArn,
                REGION_NAME: this.region,
            },
        });
        // S3 trigger for textract processor
        props.processingBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(this.textractProcessorFunction), { suffix: '.pdf' });
        // 3. Textract Results Processor Function - Triggered by SNS
        this.textractResultsProcessorFunction = new lambda.Function(this, 'TextractResultsProcessorFunction', {
            functionName: 'TextractResultsProcessorFunction',
            runtime: lambda.Runtime.PYTHON_3_13,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/textract-results-processor')),
            timeout: cdk.Duration.seconds(900),
            memorySize: 1024,
            role: props.textractResultsProcessorRole,
            environment: {
                METADATA_TABLE: props.metadataTable.tableName,
                DIGESTS_BUCKET: props.digestsBucket.bucketName,
                REGION_NAME: this.region,
            },
        });
        // SNS trigger for textract results processor
        this.textractResultsProcessorFunction.addEventSource(new lambdaEventSources.SnsEventSource(props.textractCompletionTopic));
        // 4. Bedrock Vectorization Function
        this.bedrockVectorizationFunction = new lambda.Function(this, 'BedrockVectorizationFunction', {
            functionName: 'BedrockToS3Vectorization',
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/bedrock-vectorization')),
            timeout: cdk.Duration.seconds(300),
            memorySize: 512,
            role: props.bedrockVectorizationRole,
            environment: {
                VECTORS_BUCKET: props.vectorsBucket.bucketName,
                VECTORS_JSON_BUCKET: props.vectorsJsonBucket.bucketName,
                REGION_NAME: this.region,
            },
        });
        // S3 trigger for bedrock vectorization
        props.digestsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(this.bedrockVectorizationFunction), { suffix: '.json' });
        // 5. Query Processing Function
        this.queryProcessingFunction = new lambda.Function(this, 'QueryProcessingFunction', {
            functionName: 'QueryProcessingFunction',
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.lambda_handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../../../lambda-functions/query-processing')),
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            role: props.queryProcessingRole,
            environment: {
                VECTORS_BUCKET: props.vectorsBucket.bucketName,
                METADATA_TABLE: props.metadataTable.tableName,
                QUERY_LOGS_TABLE: props.queryLogsTable.tableName,
                REGION_NAME: this.region,
            },
        });
        // Outputs
        new cdk.CfnOutput(this, 'DocumentIngestionFunctionArn', {
            value: this.documentIngestionFunction.functionArn,
            exportName: 'document-ingestion-function-arn',
        });
        new cdk.CfnOutput(this, 'QueryProcessingFunctionArn', {
            value: this.queryProcessingFunction.functionArn,
            exportName: 'query-processing-function-arn',
        });
    }
}
exports.PdfConversationLambdaStack = PdfConversationLambdaStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1sYW1iZGEtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwZGYtY29udmVyc2F0aW9uLWxhbWJkYS1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUVuQywrREFBaUQ7QUFDakQsdURBQXlDO0FBSXpDLHNFQUF3RDtBQUN4RCx5RkFBMkU7QUFDM0UsMkNBQTZCO0FBaUI3QixNQUFhLDBCQUEyQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ3ZDLHlCQUF5QixDQUFrQjtJQUMzQyx5QkFBeUIsQ0FBa0I7SUFDM0MsZ0NBQWdDLENBQWtCO0lBQ2xELDRCQUE0QixDQUFrQjtJQUM5Qyx1QkFBdUIsQ0FBa0I7SUFFekQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQztRQUM5RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QiwwREFBMEQ7UUFDMUQsSUFBSSxDQUFDLHlCQUF5QixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsMkJBQTJCLEVBQUU7WUFDdEYsWUFBWSxFQUFFLDJCQUEyQjtZQUN6QyxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxzQkFBc0I7WUFDL0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLDhDQUE4QyxDQUFDLENBQUM7WUFDakcsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEVBQUUsR0FBRztZQUNmLElBQUksRUFBRSxLQUFLLENBQUMscUJBQXFCO1lBQ2pDLFdBQVcsRUFBRTtnQkFDWCxjQUFjLEVBQUUsS0FBSyxDQUFDLGFBQWEsQ0FBQyxTQUFT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QUFhLENBQUMsVUFBVTtnQkFDOUMsY0FBYyxFQUFFLEtBQUssQ0FBQyxhQUFhLENBQUMsU0FBUztnQkFDN0MsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLGNBQWMsQ0FBQyxTQUFTO2dCQUNoRCxXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU07YUFDekI7U0FDRixDQUFDLENBQUM7UUFFSCxVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSw4QkFBOEIsRUFBRTtZQUN0RCxLQUFLLEVBQUUsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFdBQVc7WUFDakQsVUFBVSxFQUFFLGlDQUFpQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDRCQUE0QixFQUFFO1lBQ3BELEtBQUssRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsV0FBVztZQUMvQyxVQUFVLEVBQUUsK0JBQStCO1NBQzVDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9IRCxnRUErSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xyXG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xyXG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xyXG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xyXG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XHJcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcclxuaW1wb3J0ICogYXMgczNuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1ub3RpZmljYXRpb25zJztcclxuaW1wb3J0ICogYXMgbGFtYmRhRXZlbnRTb3VyY2VzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtZXZlbnQtc291cmNlcyc7XHJcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFBkZkNvbnZlcnNhdGlvbkxhbWJkYVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XHJcbiAgcmVhZG9ubHkgcHJvY2Vzc2luZ0J1Y2tldDogczMuSUJ1Y2tldDtcclxuICByZWFkb25seSBkaWdlc3RzQnVja2V0OiBzMy5JQnVja2V0O1xyXG4gIHJlYWRvbmx5IHZlY3RvcnNCdWNrZXQ6IHMzLklCdWNrZXQ7XHJcbiAgcmVhZG9ubHkgdmVjdG9yc0pzb25CdWNrZXQ6IHMzLklCdWNrZXQ7XHJcbiAgcmVhZG9ubHkgbWV0YWRhdGFUYWJsZTogZHluYW1vZGIuSVRhYmxlO1xyXG4gIHJlYWRvbmx5IHF1ZXJ5TG9nc1RhYmxlOiBkeW5hbW9kYi5JVGFibGU7XHJcbiAgcmVhZG9ubHkgdGV4dHJhY3RDb21wbGV0aW9uVG9waWM6IHNucy5JVG9waWM7XHJcbiAgcmVhZG9ubHkgZG9jdW1lbnRJbmdlc3Rpb25Sb2xlOiBpYW0uSVJvbGU7XHJcbiAgcmVhZG9ubHkgdGV4dHJhY3RQcm9jZXNzb3JSb2xlOiBpYW0uSVJvbGU7XHJcbiAgcmVhZG9ubHkgdGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yUm9sZTogaWFtLklSb2xlO1xyXG4gIHJlYWRvbmx5IGJlZHJvY2tWZWN0b3JpemF0aW9uUm9sZTogaWFtLklSb2xlO1xyXG4gIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ1JvbGU6IGlhbS5JUm9sZTtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIFBkZkNvbnZlcnNhdGlvbkxhbWJkYVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcclxuICBwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xyXG4gIHB1YmxpYyByZWFkb25seSB0ZXh0cmFjdFByb2Nlc3NvckZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IHRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XHJcbiAgcHVibGljIHJlYWRvbmx5IGJlZHJvY2tWZWN0b3JpemF0aW9uRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcclxuICBwdWJsaWMgcmVhZG9ubHkgcXVlcnlQcm9jZXNzaW5nRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcclxuXHJcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFBkZkNvbnZlcnNhdGlvbkxhbWJkYVN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIDEuIERvY3VtZW50IEluZ2VzdGlvbiBGdW5jdGlvbiAtIFRyaWdnZXJlZCBieSBTMyB1cGxvYWRcclxuICAgIHRoaXMuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ0RvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb24nLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL2RvY3VtZW50LWluZ2VzdGlvbicpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoNjApLFxyXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXHJcbiAgICAgIHJvbGU6IHByb3BzLmRvY3VtZW50SW5nZXN0aW9uUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgU05TX1RPUElDX0FSTjogcHJvcHMudGV4dHJhY3RDb21wbGV0aW9uVG9waWMudG9waWNBcm4sXHJcbiAgICAgICAgUkVHSU9OX05BTUU6IHRoaXMucmVnaW9uLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUzMgdHJpZ2dlciBmb3IgZG9jdW1lbnQgaW5nZXN0aW9uXHJcbiAgICBwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxyXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXHJcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24odGhpcy5kb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uKSxcclxuICAgICAgeyBzdWZmaXg6ICcucGRmJyB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIDIuIFRleHRyYWN0IFByb2Nlc3NvciBGdW5jdGlvbiAtIFRyaWdnZXJlZCBieSBTMyB1cGxvYWRcclxuICAgIHRoaXMudGV4dHJhY3RQcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1RleHRyYWN0UHJvY2Vzc29yRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ1RleHRyYWN0UHJvY2Vzc29yRnVuY3Rpb24nLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMyxcclxuICAgICAgaGFuZGxlcjogJ2luZGV4LmxhbWJkYV9oYW5kbGVyJyxcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi8uLi9sYW1iZGEtZnVuY3Rpb25zL3RleHRyYWN0LXByb2Nlc3NvcicpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKSxcclxuICAgICAgbWVtb3J5U2l6ZTogMTI4LFxyXG4gICAgICByb2xlOiBwcm9wcy50ZXh0cmFjdFByb2Nlc3NvclJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgU05TX1RPUElDX0FSTjogcHJvcHMudGV4dHJhY3RDb21wbGV0aW9uVG9waWMudG9waWNBcm4sXHJcbiAgICAgICAgUkVHSU9OX05BTUU6IHRoaXMucmVnaW9uLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUzMgdHJpZ2dlciBmb3IgdGV4dHJhY3QgcHJvY2Vzc29yXHJcbiAgICBwcm9wcy5wcm9jZXNzaW5nQnVja2V0LmFkZEV2ZW50Tm90aWZpY2F0aW9uKFxyXG4gICAgICBzMy5FdmVudFR5cGUuT0JKRUNUX0NSRUFURUQsXHJcbiAgICAgIG5ldyBzM24uTGFtYmRhRGVzdGluYXRpb24odGhpcy50ZXh0cmFjdFByb2Nlc3NvckZ1bmN0aW9uKSxcclxuICAgICAgeyBzdWZmaXg6ICcucGRmJyB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIDMuIFRleHRyYWN0IFJlc3VsdHMgUHJvY2Vzc29yIEZ1bmN0aW9uIC0gVHJpZ2dlcmVkIGJ5IFNOU1xyXG4gICAgdGhpcy50ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1RleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uJywge1xyXG4gICAgICBmdW5jdGlvbk5hbWU6ICdUZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbicsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzEzLFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2xhbWJkYS1mdW5jdGlvbnMvdGV4dHJhY3QtcmVzdWx0cy1wcm9jZXNzb3InKSksXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDkwMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXHJcbiAgICAgIHJvbGU6IHByb3BzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvclJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgTUVUQURBVEFfVEFCTEU6IHByb3BzLm1ldGFkYXRhVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIERJR0VTVFNfQlVDS0VUOiBwcm9wcy5kaWdlc3RzQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgUkVHSU9OX05BTUU6IHRoaXMucmVnaW9uLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gU05TIHRyaWdnZXIgZm9yIHRleHRyYWN0IHJlc3VsdHMgcHJvY2Vzc29yXHJcbiAgICB0aGlzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uLmFkZEV2ZW50U291cmNlKFxyXG4gICAgICBuZXcgbGFtYmRhRXZlbnRTb3VyY2VzLlNuc0V2ZW50U291cmNlKHByb3BzLnRleHRyYWN0Q29tcGxldGlvblRvcGljKVxyXG4gICAgKTtcclxuXHJcbiAgICAvLyA0LiBCZWRyb2NrIFZlY3Rvcml6YXRpb24gRnVuY3Rpb25cclxuICAgIHRoaXMuYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0JlZHJvY2tWZWN0b3JpemF0aW9uRnVuY3Rpb24nLCB7XHJcbiAgICAgIGZ1bmN0aW9uTmFtZTogJ0JlZHJvY2tUb1MzVmVjdG9yaXphdGlvbicsXHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzksXHJcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5sYW1iZGFfaGFuZGxlcicsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vLi4vbGFtYmRhLWZ1bmN0aW9ucy9iZWRyb2NrLXZlY3Rvcml6YXRpb24nKSksXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwMCksXHJcbiAgICAgIG1lbW9yeVNpemU6IDUxMixcclxuICAgICAgcm9sZTogcHJvcHMuYmVkcm9ja1ZlY3Rvcml6YXRpb25Sb2xlLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIFZFQ1RPUlNfQlVDS0VUOiBwcm9wcy52ZWN0b3JzQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgVkVDVE9SU19KU09OX0JVQ0tFVDogcHJvcHMudmVjdG9yc0pzb25CdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgICBSRUdJT05fTkFNRTogdGhpcy5yZWdpb24sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTMyB0cmlnZ2VyIGZvciBiZWRyb2NrIHZlY3Rvcml6YXRpb25cclxuICAgIHByb3BzLmRpZ2VzdHNCdWNrZXQuYWRkRXZlbnROb3RpZmljYXRpb24oXHJcbiAgICAgIHMzLkV2ZW50VHlwZS5PQkpFQ1RfQ1JFQVRFRCxcclxuICAgICAgbmV3IHMzbi5MYW1iZGFEZXN0aW5hdGlvbih0aGlzLmJlZHJvY2tWZWN0b3JpemF0aW9uRnVuY3Rpb24pLFxyXG4gICAgICB7IHN1ZmZpeDogJy5qc29uJyB9XHJcbiAgICApO1xyXG5cclxuICAgIC8vIDUuIFF1ZXJ5IFByb2Nlc3NpbmcgRnVuY3Rpb25cclxuICAgIHRoaXMucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdRdWVyeVByb2Nlc3NpbmdGdW5jdGlvbicsIHtcclxuICAgICAgZnVuY3Rpb25OYW1lOiAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24nLFxyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM185LFxyXG4gICAgICBoYW5kbGVyOiAnaW5kZXgubGFtYmRhX2hhbmRsZXInLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uLy4uL2xhbWJkYS1mdW5jdGlvbnMvcXVlcnktcHJvY2Vzc2luZycpKSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgICBtZW1vcnlTaXplOiA1MTIsXHJcbiAgICAgIHJvbGU6IHByb3BzLnF1ZXJ5UHJvY2Vzc2luZ1JvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgVkVDVE9SU19CVUNLRVQ6IHByb3BzLnZlY3RvcnNCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgICBNRVRBREFUQV9UQUJMRTogcHJvcHMubWV0YWRhdGFUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgUVVFUllfTE9HU19UQUJMRTogcHJvcHMucXVlcnlMb2dzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIFJFR0lPTl9OQU1FOiB0aGlzLnJlZ2lvbixcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIE91dHB1dHNcclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uQXJuJywge1xyXG4gICAgICB2YWx1ZTogdGhpcy5kb2N1bWVudEluZ2VzdGlvbkZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBleHBvcnROYW1lOiAnZG9jdW1lbnQtaW5nZXN0aW9uLWZ1bmN0aW9uLWFybicsXHJcbiAgICB9KTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnUXVlcnlQcm9jZXNzaW5nRnVuY3Rpb25Bcm4nLCB7XHJcbiAgICAgIHZhbHVlOiB0aGlzLnF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLmZ1bmN0aW9uQXJuLFxyXG4gICAgICBleHBvcnROYW1lOiAncXVlcnktcHJvY2Vzc2luZy1mdW5jdGlvbi1hcm4nLFxyXG4gICAgfSk7XHJcbiAgfVxyXG59Il19