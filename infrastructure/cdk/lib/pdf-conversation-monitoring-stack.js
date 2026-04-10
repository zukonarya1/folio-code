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
exports.PdfConversationMonitoringStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const cloudwatchActions = __importStar(require("aws-cdk-lib/aws-cloudwatch-actions"));
const sns = __importStar(require("aws-cdk-lib/aws-sns"));
const snsSubscriptions = __importStar(require("aws-cdk-lib/aws-sns-subscriptions"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const budgets = __importStar(require("aws-cdk-lib/aws-budgets"));
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
class PdfConversationMonitoringStack extends cdk.Stack {
    systemDashboard;
    alertTopic;
    constructor(scope, id, props) {
        super(scope, id, props);
        const p = props.envConfig.prefix;
        // SNS Topic for Alerts
        this.alertTopic = new sns.Topic(this, 'SystemAlerts', {
            topicName: `${p}pdf-conversation-system-alerts`,
            displayName: 'PDF Conversation System Alerts',
        });
        // Email subscription for alerts via SSM dynamic reference (resolved at deploy time)
        const notificationEmail = ssm.StringParameter.valueForStringParameter(this, `/pdfconv/${props.envConfig.name}/notification-email`);
        this.alertTopic.addSubscription(new snsSubscriptions.EmailSubscription(notificationEmail));
        // Create CloudWatch Dashboard
        this.systemDashboard = new cloudwatch.Dashboard(this, 'SystemDashboard', {
            dashboardName: `${p}PDF-Conversation-System-Overview`,
        });
        // Lambda Function Metrics Widgets
        this.createLambdaMonitoring(props);
        // DynamoDB Metrics Widgets
        this.createDynamoDBMonitoring(props);
        // S3 Metrics Widgets
        this.createS3Monitoring(props);
        // System Health and Cost Widgets
        this.createSystemHealthMonitoring();
        // Create CloudWatch Alarms
        this.createAlarms(props);
        if (props.envConfig.name === 'prod') {
            this.createProdBusinessMonitoring(props);
        }
        // Output dashboard URL
        new cdk.CfnOutput(this, 'DashboardURL', {
            value: `https://${this.region}.console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.systemDashboard.dashboardName}`,
            description: 'CloudWatch Dashboard URL',
        });
    }
    createLambdaMonitoring(props) {
        const lambdaFunctions = [
            { name: 'Document Ingestion', func: props.documentIngestionFunction },
            { name: 'Document Search', func: props.queryProcessingFunction },
            { name: 'Study Book', func: props.studyBookFunction },
            { name: 'Textract Results', func: props.textractResultsProcessorFunction },
            { name: 'Bedrock Vectorization', func: props.bedrockVectorizationFunction },
            { name: 'Conversation', func: props.conversationFunction },
        ];
        // Lambda Invocations Widget
        const invocationsWidget = new cloudwatch.GraphWidget({
            title: 'Lambda Function Invocations',
            width: 12,
            height: 6,
            left: lambdaFunctions.map(({ name, func }) => new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Invocations',
                dimensionsMap: { FunctionName: func.functionName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
                label: name,
            })),
        });
        // Lambda Duration Widget
        const durationWidget = new cloudwatch.GraphWidget({
            title: 'Lambda Function Duration (ms)',
            width: 12,
            height: 6,
            left: lambdaFunctions.map(({ name, func }) => new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Duration',
                dimensionsMap: { FunctionName: func.functionName },
                statistic: 'Average',
                period: cdk.Duration.minutes(5),
                label: name,
            })),
        });
        // Lambda Errors Widget
        const errorsWidget = new cloudwatch.GraphWidget({
            title: 'Lambda Function Errors',
            width: 12,
            height: 6,
            left: lambdaFunctions.map(({ name, func }) => new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'Errors',
                dimensionsMap: { FunctionName: func.functionName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
                label: name,
            })),
        });
        // Lambda Concurrent Executions Widget
        const concurrencyWidget = new cloudwatch.GraphWidget({
            title: 'Lambda Concurrent Executions',
            width: 12,
            height: 6,
            left: lambdaFunctions.map(({ name, func }) => new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'ConcurrentExecutions',
                dimensionsMap: { FunctionName: func.functionName },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(5),
                label: name,
            })),
        });
        this.systemDashboard.addWidgets(invocationsWidget, durationWidget, errorsWidget, concurrencyWidget);
    }
    createDynamoDBMonitoring(props) {
        const tables = [
            { name: 'Metadata Table', table: props.metadataTable },
            { name: 'Query Logs Table', table: props.queryLogsTable },
        ];
        // DynamoDB Read/Write Capacity Widget
        const capacityWidget = new cloudwatch.GraphWidget({
            title: 'DynamoDB Read/Write Capacity',
            width: 12,
            height: 6,
            left: [
                ...tables.flatMap(({ name, table }) => [
                    new cloudwatch.Metric({
                        namespace: 'AWS/DynamoDB',
                        metricName: 'ConsumedReadCapacityUnits',
                        dimensionsMap: { TableName: table.tableName },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5),
                        label: `${name} - Read`,
                    }),
                    new cloudwatch.Metric({
                        namespace: 'AWS/DynamoDB',
                        metricName: 'ConsumedWriteCapacityUnits',
                        dimensionsMap: { TableName: table.tableName },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5),
                        label: `${name} - Write`,
                    }),
                ]),
            ],
        });
        // DynamoDB Throttles Widget
        const throttlesWidget = new cloudwatch.GraphWidget({
            title: 'DynamoDB Throttled Requests',
            width: 12,
            height: 6,
            left: [
                ...tables.flatMap(({ name, table }) => [
                    new cloudwatch.Metric({
                        namespace: 'AWS/DynamoDB',
                        metricName: 'ReadThrottleEvents',
                        dimensionsMap: { TableName: table.tableName },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5),
                        label: `${name} - Read Throttles`,
                    }),
                    new cloudwatch.Metric({
                        namespace: 'AWS/DynamoDB',
                        metricName: 'WriteThrottleEvents',
                        dimensionsMap: { TableName: table.tableName },
                        statistic: 'Sum',
                        period: cdk.Duration.minutes(5),
                        label: `${name} - Write Throttles`,
                    }),
                ]),
            ],
        });
        this.systemDashboard.addWidgets(capacityWidget, throttlesWidget);
    }
    createS3Monitoring(props) {
        const buckets = [
            { name: 'Processing', bucket: props.processingBucket },
            { name: 'VectorsJson', bucket: props.vectorsJsonBucket },
        ];
        // S3 Requests Widget
        const requestsWidget = new cloudwatch.GraphWidget({
            title: 'S3 Request Metrics',
            width: 12,
            height: 6,
            left: [
                ...buckets.flatMap(({ name, bucket }) => [
                    new cloudwatch.Metric({
                        namespace: 'AWS/S3',
                        metricName: 'NumberOfObjects',
                        dimensionsMap: {
                            BucketName: bucket.bucketName,
                            StorageType: 'AllStorageTypes'
                        },
                        statistic: 'Average',
                        period: cdk.Duration.hours(1),
                        label: `${name} - Object Count`,
                    }),
                    new cloudwatch.Metric({
                        namespace: 'AWS/S3',
                        metricName: 'BucketSizeBytes',
                        dimensionsMap: {
                            BucketName: bucket.bucketName,
                            StorageType: 'StandardStorage'
                        },
                        statistic: 'Average',
                        period: cdk.Duration.hours(1),
                        label: `${name} - Size (Bytes)`,
                    }),
                ]),
            ],
        });
        this.systemDashboard.addWidgets(requestsWidget);
    }
    createSystemHealthMonitoring() {
        // System Health Text Widget
        const systemHealthWidget = new cloudwatch.TextWidget({
            markdown: `# PDF Conversation System Health Dashboard

## System Components
- **PDF Ingestion**: Extracts text from uploaded PDFs (PyPDF / Textract fallback)
- **Vectorization**: Chunks text, embeds with Cohere, writes to S3 Vectors
- **Study Book**: Auto-generates school-book summary from full document digest
- **Document Search**: Semantic similarity search (30s timeout, no Haiku)
- **Document Chat**: Multi-turn RAG conversation with Haiku

## Alert Thresholds
- Lambda error rate > 5%
- Lambda duration > 80% of timeout
- DynamoDB throttling events
- StudyBook DLQ depth > 0`,
            width: 24,
            height: 8,
        });
        this.systemDashboard.addWidgets(systemHealthWidget);
    }
    createAlarms(props) {
        const lambdaFunctions = [
            { name: 'DocumentIngestion', func: props.documentIngestionFunction, timeoutThreshold: 240 },
            { name: 'DocumentSearch', func: props.queryProcessingFunction, timeoutThreshold: 24 },
            { name: 'StudyBook', func: props.studyBookFunction, timeoutThreshold: 720 },
            { name: 'TextractResults', func: props.textractResultsProcessorFunction, timeoutThreshold: 720 },
            { name: 'BedrockVectorization', func: props.bedrockVectorizationFunction, timeoutThreshold: 240 },
            { name: 'ConversationFunction', func: props.conversationFunction, timeoutThreshold: 48 },
        ];
        lambdaFunctions.forEach(({ name, func, timeoutThreshold }) => {
            // High Error Rate Alarm
            new cloudwatch.Alarm(this, `${name}HighErrorRate`, {
                alarmName: `${props.envConfig.prefix}PDF-Conversation-${name}-HighErrorRate`,
                alarmDescription: `High error rate detected for ${name} function`,
                metric: new cloudwatch.Metric({
                    namespace: 'AWS/Lambda',
                    metricName: 'Errors',
                    dimensionsMap: { FunctionName: func.functionName },
                    statistic: 'Sum',
                    period: cdk.Duration.minutes(5),
                }),
                threshold: 5,
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
            // High Duration Alarm
            new cloudwatch.Alarm(this, `${name}HighDuration`, {
                alarmName: `${props.envConfig.prefix}PDF-Conversation-${name}-HighDuration`,
                alarmDescription: `High duration detected for ${name} function`,
                metric: new cloudwatch.Metric({
                    namespace: 'AWS/Lambda',
                    metricName: 'Duration',
                    dimensionsMap: { FunctionName: func.functionName },
                    statistic: 'Average',
                    period: cdk.Duration.minutes(5),
                }),
                threshold: timeoutThreshold * 1000, // Convert to milliseconds
                evaluationPeriods: 2,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        });
        new cloudwatch.Alarm(this, 'StudyBookDlqDepth', {
            alarmName: `${props.envConfig.prefix}PDF-Conversation-StudyBook-DLQ-Depth`,
            alarmDescription: 'StudyBook DLQ has messages — summary generation failures detected',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/SQS',
                metricName: 'ApproximateNumberOfMessagesVisible',
                dimensionsMap: { QueueName: props.studyBookDlq.queueName },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5),
            }),
            threshold: 1,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        // DynamoDB Throttling Alarms
        [props.metadataTable, props.queryLogsTable].forEach((table, index) => {
            const tableName = index === 0 ? 'Metadata' : 'QueryLogs';
            new cloudwatch.Alarm(this, `${tableName}ReadThrottling`, {
                alarmName: `${props.envConfig.prefix}PDF-Conversation-${tableName}-ReadThrottling`,
                alarmDescription: `Read throttling detected for ${tableName} table`,
                metric: new cloudwatch.Metric({
                    namespace: 'AWS/DynamoDB',
                    metricName: 'ReadThrottleEvents',
                    dimensionsMap: { TableName: table.tableName },
                    statistic: 'Sum',
                    period: cdk.Duration.minutes(5),
                }),
                threshold: 1,
                evaluationPeriods: 1,
                treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
            }).addAlarmAction(new cloudwatchActions.SnsAction(this.alertTopic));
        });
    }
    createProdBusinessMonitoring(props) {
        this.alertTopic.addToResourcePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('budgets.amazonaws.com')],
            actions: ['SNS:Publish'],
            resources: [this.alertTopic.topicArn],
        }));
        new budgets.CfnBudget(this, 'BedrockMonthlyBudget', {
            budget: {
                budgetName: 'folio-bedrock-monthly',
                budgetType: 'COST',
                timeUnit: 'MONTHLY',
                budgetLimit: { amount: 20, unit: 'USD' },
                costFilters: { Service: ['Amazon Bedrock'] },
            },
            notificationsWithSubscribers: [
                {
                    notification: {
                        notificationType: 'ACTUAL',
                        comparisonOperator: 'GREATER_THAN',
                        threshold: 80,
                        thresholdType: 'PERCENTAGE',
                    },
                    subscribers: [
                        {
                            subscriptionType: 'SNS',
                            address: this.alertTopic.topicArn,
                        },
                    ],
                },
            ],
        });
        const businessMetricsWidget = new cloudwatch.TextWidget({
            markdown: `# Folio Business Metrics

## Usage Limits (per user, free tier)
- Monthly budget: 3,000,000 tokens per user (ingestion + chat)
- Doc count limit: 20 lifetime docs
- Daily chat: 50 messages/day

## Bedrock Budget Alert
- Monthly Bedrock spend alert at 80% of $20 USD threshold
- Notification → SSM:/pdfconv/${props.envConfig.name}/notification-email`,
            width: 24,
            height: 6,
        });
        this.systemDashboard.addWidgets(businessMetricsWidget);
    }
}
exports.PdfConversationMonitoringStack = PdfConversationMonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1tb25pdG9yaW5nLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGRmLWNvbnZlcnNhdGlvbi1tb25pdG9yaW5nLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBRW5DLHVFQUF5RDtBQUN6RCxzRkFBd0U7QUFLeEUseURBQTJDO0FBQzNDLG9GQUFzRTtBQUN0RSx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELHlEQUEyQztBQWtCM0MsTUFBYSw4QkFBK0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUMzQyxlQUFlLENBQXVCO0lBQ3RDLFVBQVUsQ0FBWTtJQUV0QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTBDO1FBQ2xGLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDO1FBRWpDLHVCQUF1QjtRQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3BELFNBQVMsRUFBRSxHQUFHLENBQUMsZ0NBQWdDO1lBQy9DLFdBQVcsRUFBRSxnQ0FBZ0M7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsb0ZBQW9GO1FBQ3BGLE1BQU0saUJBQWlCLEdBQUcsR0FBRyxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FDbkUsSUFBSSxFQUNKLFlBQVksS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLHFCQUFxQixDQUN0RCxDQUFDO1FBQ0YsSUFBSSxDQUFDLFVBQVUsQ0FBQyxlQUFlLENBQzdCLElBQUksZ0JBQWdCLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FDMUQsQ0FBQztRQUVGLDhCQUE4QjtRQUM5QixJQUFJLENBQUMsZUFBZSxHQUFHLElB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QUUsUUFBUTt3QkFDMUIsa0JBQWtCLEVBQUUsY0FBYzt3QkFDbEMsU0FBUyxFQUFFLEVBQUU7d0JBQ2IsYUFBYSxFQUFFLFlBQVk7cUJBQzVCO29CQUNELFdBQVcsRUFBRTt3QkFDWDs0QkFDRSxnQkFBZ0IsRUFBRSxLQUFLOzRCQUN2QixPQUFPLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRO3lCQUNsQztxQkFDRjtpQkFDRjthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLFVBQVUsQ0FBQyxVQUFVLENBQUM7WUFDdEQsUUFBUSxFQUFFOzs7Ozs7Ozs7Z0NBU2dCLEtBQUssQ0FBQyxTQUFTLENBQUMsSUFBSSxxQkFBcUI7WUFDbkUsS0FBSyxFQUFFLEVBQUU7WUFDVCxNQUFNLEVBQUUsQ0FBQztTQUNWLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLHFCQUFxQixDQUFDLENBQUM7SUFDekQsQ0FBQztDQUNGO0FBblpELHdFQW1aQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaEFjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gtYWN0aW9ucyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcbmltcG9ydCAqIGFzIHNucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zJztcbmltcG9ydCAqIGFzIHNuc1N1YnNjcmlwdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucy1zdWJzY3JpcHRpb25zJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGJ1ZGdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWJ1ZGdldHMnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0IHsgRW52aXJvbm1lbnRDb25maWcgfSBmcm9tICcuL2Vudmlyb25tZW50LWNvbmZpZyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGRvY3VtZW50SW5nZXN0aW9uRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IHF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSB0ZXh0cmFjdFJlc3VsdHNQcm9jZXNzb3JGdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgYmVkcm9ja1ZlY3Rvcml6YXRpb25GdW5jdGlvbjogbGFtYmRhLklGdW5jdGlvbjtcbiAgcmVhZG9ubHkgc3R1ZHlCb29rRnVuY3Rpb246IGxhbWJkYS5JRnVuY3Rpb247XG4gIHJlYWRvbmx5IGNvbnZlcnNhdGlvbkZ1bmN0aW9uOiBsYW1iZGEuSUZ1bmN0aW9uO1xuICByZWFkb25seSBzdHVkeUJvb2tEbHE6IHNxcy5JUXVldWU7XG4gIHJlYWRvbmx5IG1ldGFkYXRhVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgcXVlcnlMb2dzVGFibGU6IGR5bmFtb2RiLklUYWJsZTtcbiAgcmVhZG9ubHkgcHJvY2Vzc2luZ0J1Y2tldDogczMuSUJ1Y2tldDtcbiAgcmVhZG9ubHkgdmVjdG9yc0pzb25CdWNrZXQ6IHMzLklCdWNrZXQ7XG4gIHJlYWRvbmx5IGVudkNvbmZpZzogRW52aXJvbm1lbnRDb25maWc7XG59XG5cbmV4cG9ydCBjbGFzcyBQZGZDb252ZXJzYXRpb25Nb25pdG9yaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgc3lzdGVtRGFzaGJvYXJkOiBjbG91ZHdhdGNoLkRhc2hib2FyZDtcbiAgcHVibGljIHJlYWRvbmx5IGFsZXJ0VG9waWM6IHNucy5Ub3BpYztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHAgPSBwcm9wcy5lbnZDb25maWcucHJlZml4O1xuXG4gICAgLy8gU05TIFRvcGljIGZvciBBbGVydHNcbiAgICB0aGlzLmFsZXJ0VG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdTeXN0ZW1BbGVydHMnLCB7XG4gICAgICB0b3BpY05hbWU6IGAke3B9cGRmLWNvbnZlcnNhdGlvbi1zeXN0ZW0tYWxlcnRzYCxcbiAgICAgIGRpc3BsYXlOYW1lOiAnUERGIENvbnZlcnNhdGlvbiBTeXN0ZW0gQWxlcnRzJyxcbiAgICB9KTtcblxuICAgIC8vIEVtYWlsIHN1YnNjcmlwdGlvbiBmb3IgYWxlcnRzIHZpYSBTU00gZHluYW1pYyByZWZlcmVuY2UgKHJlc29sdmVkIGF0IGRlcGxveSB0aW1lKVxuICAgIGNvbnN0IG5vdGlmaWNhdGlvbkVtYWlsID0gc3NtLlN0cmluZ1BhcmFtZXRlci52YWx1ZUZvclN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBgL3BkZmNvbnYvJHtwcm9wcy5lbnZDb25maWcubmFtZX0vbm90aWZpY2F0aW9uLWVtYWlsYFxuICAgICk7XG4gICAgdGhpcy5hbGVydFRvcGljLmFkZFN1YnNjcmlwdGlvbihcbiAgICAgIG5ldyBzbnNTdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKG5vdGlmaWNhdGlvbkVtYWlsKVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBEYXNoYm9hcmRcbiAgICB0aGlzLnN5c3RlbURhc2hib2FyZCA9IG5ldyBjbG91ZHdhdGNoLkRhc2hib2FyZCh0aGlzLCAnU3lzdGVtRGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYCR7cH1QREYtQ29udmVyc2F0aW9uLVN5c3RlbS1PdmVydmlld2AsXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgRnVuY3Rpb24gTWV0cmljcyBXaWRnZXRzXG4gICAgdGhpcy5jcmVhdGVMYW1iZGFNb25pdG9yaW5nKHByb3BzKTtcblxuICAgIC8vIER5bmFtb0RCIE1ldHJpY3MgV2lkZ2V0c1xuICAgIHRoaXMuY3JlYXRlRHluYW1vREJNb25pdG9yaW5nKHByb3BzKTtcblxuICAgIC8vIFMzIE1ldHJpY3MgV2lkZ2V0c1xuICAgIHRoaXMuY3JlYXRlUzNNb25pdG9yaW5nKHByb3BzKTtcblxuICAgIC8vIFN5c3RlbSBIZWFsdGggYW5kIENvc3QgV2lkZ2V0c1xuICAgIHRoaXMuY3JlYXRlU3lzdGVtSGVhbHRoTW9uaXRvcmluZygpO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggQWxhcm1zXG4gICAgdGhpcy5jcmVhdGVBbGFybXMocHJvcHMpO1xuXG4gICAgaWYgKHByb3BzLmVudkNvbmZpZy5uYW1lID09PSAncHJvZCcpIHtcbiAgICAgIHRoaXMuY3JlYXRlUHJvZEJ1c2luZXNzTW9uaXRvcmluZyhwcm9wcyk7XG4gICAgfVxuXG4gICAgLy8gT3V0cHV0IGRhc2hib2FyZCBVUkxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGFzaGJvYXJkVVJMJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7dGhpcy5yZWdpb259LmNvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHt0aGlzLnN5c3RlbURhc2hib2FyZC5kYXNoYm9hcmROYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkV2F0Y2ggRGFzaGJvYXJkIFVSTCcsXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUxhbWJkYU1vbml0b3JpbmcocHJvcHM6IFBkZkNvbnZlcnNhdGlvbk1vbml0b3JpbmdTdGFja1Byb3BzKSB7XG4gICAgY29uc3QgbGFtYmRhRnVuY3Rpb25zID0gW1xuICAgICAgeyBuYW1lOiAnRG9jdW1lbnQgSW5nZXN0aW9uJywgZnVuYzogcHJvcHMuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbiB9LFxuICAgICAgeyBuYW1lOiAnRG9jdW1lbnQgU2VhcmNoJywgZnVuYzogcHJvcHMucXVlcnlQcm9jZXNzaW5nRnVuY3Rpb24gfSxcbiAgICAgIHsgbmFtZTogJ1N0dWR5IEJvb2snLCBmdW5jOiBwcm9wcy5zdHVkeUJvb2tGdW5jdGlvbiB9LFxuICAgICAgeyBuYW1lOiAnVGV4dHJhY3QgUmVzdWx0cycsIGZ1bmM6IHByb3BzLnRleHRyYWN0UmVzdWx0c1Byb2Nlc3NvckZ1bmN0aW9uIH0sXG4gICAgICB7IG5hbWU6ICdCZWRyb2NrIFZlY3Rvcml6YXRpb24nLCBmdW5jOiBwcm9wcy5iZWRyb2NrVmVjdG9yaXphdGlvbkZ1bmN0aW9uIH0sXG4gICAgICB7IG5hbWU6ICdDb252ZXJzYXRpb24nLCBmdW5jOiBwcm9wcy5jb252ZXJzYXRpb25GdW5jdGlvbiB9LFxuICAgIF07XG5cbiAgICAvLyBMYW1iZGEgSW52b2NhdGlvbnMgV2lkZ2V0XG4gICAgY29uc3QgaW52b2NhdGlvbnNXaWRnZXQgPSBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICB0aXRsZTogJ0xhbWJkYSBGdW5jdGlvbiBJbnZvY2F0aW9ucycsXG4gICAgICB3aWR0aDogMTIsXG4gICAgICBoZWlnaHQ6IDYsXG4gICAgICBsZWZ0OiBsYW1iZGFGdW5jdGlvbnMubWFwKCh7IG5hbWUsIGZ1bmMgfSkgPT5cbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnSW52b2NhdGlvbnMnLFxuICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICBsYWJlbDogbmFtZSxcbiAgICAgICAgfSlcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgRHVyYXRpb24gV2lkZ2V0XG4gICAgY29uc3QgZHVyYXRpb25XaWRnZXQgPSBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICB0aXRsZTogJ0xhbWJkYSBGdW5jdGlvbiBEdXJhdGlvbiAobXMpJyxcbiAgICAgIHdpZHRoOiAxMixcbiAgICAgIGhlaWdodDogNixcbiAgICAgIGxlZnQ6IGxhbWJkYUZ1bmN0aW9ucy5tYXAoKHsgbmFtZSwgZnVuYyB9KSA9PlxuICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9MYW1iZGEnLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdEdXJhdGlvbicsXG4gICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IGZ1bmMuZnVuY3Rpb25OYW1lIH0sXG4gICAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICBsYWJlbDogbmFtZSxcbiAgICAgICAgfSlcbiAgICAgICksXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgRXJyb3JzIFdpZGdldFxuICAgIGNvbnN0IGVycm9yc1dpZGdldCA9IG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgIHRpdGxlOiAnTGFtYmRhIEZ1bmN0aW9uIEVycm9ycycsXG4gICAgICB3aWR0aDogMTIsXG4gICAgICBoZWlnaHQ6IDYsXG4gICAgICBsZWZ0OiBsYW1iZGFGdW5jdGlvbnMubWFwKCh7IG5hbWUsIGZ1bmMgfSkgPT5cbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnRXJyb3JzJyxcbiAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IEZ1bmN0aW9uTmFtZTogZnVuYy5mdW5jdGlvbk5hbWUgfSxcbiAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgbGFiZWw6IG5hbWUsXG4gICAgICAgIH0pXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIENvbmN1cnJlbnQgRXhlY3V0aW9ucyBXaWRnZXRcbiAgICBjb25zdCBjb25jdXJyZW5jeVdpZGdldCA9IG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgIHRpdGxlOiAnTGFtYmRhIENvbmN1cnJlbnQgRXhlY3V0aW9ucycsXG4gICAgICB3aWR0aDogMTIsXG4gICAgICBoZWlnaHQ6IDYsXG4gICAgICBsZWZ0OiBsYW1iZGFGdW5jdGlvbnMubWFwKCh7IG5hbWUsIGZ1bmMgfSkgPT5cbiAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29uY3VycmVudEV4ZWN1dGlvbnMnLFxuICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgbGFiZWw6IG5hbWUsXG4gICAgICAgIH0pXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgdGhpcy5zeXN0ZW1EYXNoYm9hcmQuYWRkV2lkZ2V0cyhcbiAgICAgIGludm9jYXRpb25zV2lkZ2V0LFxuICAgICAgZHVyYXRpb25XaWRnZXQsXG4gICAgICBlcnJvcnNXaWRnZXQsXG4gICAgICBjb25jdXJyZW5jeVdpZGdldFxuICAgICk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUR5bmFtb0RCTW9uaXRvcmluZyhwcm9wczogUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrUHJvcHMpIHtcbiAgICBjb25zdCB0YWJsZXMgPSBbXG4gICAgICB7IG5hbWU6ICdNZXRhZGF0YSBUYWJsZScsIHRhYmxlOiBwcm9wcy5tZXRhZGF0YVRhYmxlIH0sXG4gICAgICB7IG5hbWU6ICdRdWVyeSBMb2dzIFRhYmxlJywgdGFibGU6IHByb3BzLnF1ZXJ5TG9nc1RhYmxlIH0sXG4gICAgXTtcblxuICAgIC8vIER5bmFtb0RCIFJlYWQvV3JpdGUgQ2FwYWNpdHkgV2lkZ2V0XG4gICAgY29uc3QgY2FwYWNpdHlXaWRnZXQgPSBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICB0aXRsZTogJ0R5bmFtb0RCIFJlYWQvV3JpdGUgQ2FwYWNpdHknLFxuICAgICAgd2lkdGg6IDEyLFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgbGVmdDogW1xuICAgICAgICAuLi50YWJsZXMuZmxhdE1hcCgoeyBuYW1lLCB0YWJsZSB9KSA9PiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29uc3VtZWRSZWFkQ2FwYWNpdHlVbml0cycsXG4gICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IFRhYmxlTmFtZTogdGFibGUudGFibGVOYW1lIH0sXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgICAgIGxhYmVsOiBgJHtuYW1lfSAtIFJlYWRgLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRHluYW1vREInLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkV3JpdGVDYXBhY2l0eVVuaXRzJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiB0YWJsZS50YWJsZU5hbWUgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgbGFiZWw6IGAke25hbWV9IC0gV3JpdGVgLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBEeW5hbW9EQiBUaHJvdHRsZXMgV2lkZ2V0XG4gICAgY29uc3QgdGhyb3R0bGVzV2lkZ2V0ID0gbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgdGl0bGU6ICdEeW5hbW9EQiBUaHJvdHRsZWQgUmVxdWVzdHMnLFxuICAgICAgd2lkdGg6IDEyLFxuICAgICAgaGVpZ2h0OiA2LFxuICAgICAgbGVmdDogW1xuICAgICAgICAuLi50YWJsZXMuZmxhdE1hcCgoeyBuYW1lLCB0YWJsZSB9KSA9PiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnUmVhZFRocm90dGxlRXZlbnRzJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiB0YWJsZS50YWJsZU5hbWUgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICAgICAgbGFiZWw6IGAke25hbWV9IC0gUmVhZCBUaHJvdHRsZXNgLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRHluYW1vREInLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ1dyaXRlVGhyb3R0bGVFdmVudHMnLFxuICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBUYWJsZU5hbWU6IHRhYmxlLnRhYmxlTmFtZSB9LFxuICAgICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgICAgICBsYWJlbDogYCR7bmFtZX0gLSBXcml0ZSBUaHJvdHRsZXNgLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICB0aGlzLnN5c3RlbURhc2hib2FyZC5hZGRXaWRnZXRzKGNhcGFjaXR5V2lkZ2V0LCB0aHJvdHRsZXNXaWRnZXQpO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTM01vbml0b3JpbmcocHJvcHM6IFBkZkNvbnZlcnNhdGlvbk1vbml0b3JpbmdTdGFja1Byb3BzKSB7XG4gICAgY29uc3QgYnVja2V0cyA9IFtcbiAgICAgIHsgbmFtZTogJ1Byb2Nlc3NpbmcnLCBidWNrZXQ6IHByb3BzLnByb2Nlc3NpbmdCdWNrZXQgfSxcbiAgICAgIHsgbmFtZTogJ1ZlY3RvcnNKc29uJywgYnVja2V0OiBwcm9wcy52ZWN0b3JzSnNvbkJ1Y2tldCB9LFxuICAgIF07XG5cbiAgICAvLyBTMyBSZXF1ZXN0cyBXaWRnZXRcbiAgICBjb25zdCByZXF1ZXN0c1dpZGdldCA9IG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgIHRpdGxlOiAnUzMgUmVxdWVzdCBNZXRyaWNzJyxcbiAgICAgIHdpZHRoOiAxMixcbiAgICAgIGhlaWdodDogNixcbiAgICAgIGxlZnQ6IFtcbiAgICAgICAgLi4uYnVja2V0cy5mbGF0TWFwKCh7IG5hbWUsIGJ1Y2tldCB9KSA9PiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9TMycsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnTnVtYmVyT2ZPYmplY3RzJyxcbiAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICAgICAgQnVja2V0TmFtZTogYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgICAgICAgIFN0b3JhZ2VUeXBlOiAnQWxsU3RvcmFnZVR5cGVzJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICAgICAgICBsYWJlbDogYCR7bmFtZX0gLSBPYmplY3QgQ291bnRgLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvUzMnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0J1Y2tldFNpemVCeXRlcycsXG4gICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgICAgIEJ1Y2tldE5hbWU6IGJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICAgICAgICBTdG9yYWdlVHlwZTogJ1N0YW5kYXJkU3RvcmFnZSdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgICAgICAgbGFiZWw6IGAke25hbWV9IC0gU2l6ZSAoQnl0ZXMpYCxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgdGhpcy5zeXN0ZW1EYXNoYm9hcmQuYWRkV2lkZ2V0cyhyZXF1ZXN0c1dpZGdldCk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVN5c3RlbUhlYWx0aE1vbml0b3JpbmcoKSB7XG4gICAgLy8gU3lzdGVtIEhlYWx0aCBUZXh0IFdpZGdldFxuICAgIGNvbnN0IHN5c3RlbUhlYWx0aFdpZGdldCA9IG5ldyBjbG91ZHdhdGNoLlRleHRXaWRnZXQoe1xuICAgICAgbWFya2Rvd246IGAjIFBERiBDb252ZXJzYXRpb24gU3lzdGVtIEhlYWx0aCBEYXNoYm9hcmRcblxuIyMgU3lzdGVtIENvbXBvbmVudHNcbi0gKipQREYgSW5nZXN0aW9uKio6IEV4dHJhY3RzIHRleHQgZnJvbSB1cGxvYWRlZCBQREZzIChQeVBERiAvIFRleHRyYWN0IGZhbGxiYWNrKVxuLSAqKlZlY3Rvcml6YXRpb24qKjogQ2h1bmtzIHRleHQsIGVtYmVkcyB3aXRoIENvaGVyZSwgd3JpdGVzIHRvIFMzIFZlY3RvcnNcbi0gKipTdHVkeSBCb29rKio6IEF1dG8tZ2VuZXJhdGVzIHNjaG9vbC1ib29rIHN1bW1hcnkgZnJvbSBmdWxsIGRvY3VtZW50IGRpZ2VzdFxuLSAqKkRvY3VtZW50IFNlYXJjaCoqOiBTZW1hbnRpYyBzaW1pbGFyaXR5IHNlYXJjaCAoMzBzIHRpbWVvdXQsIG5vIEhhaWt1KVxuLSAqKkRvY3VtZW50IENoYXQqKjogTXVsdGktdHVybiBSQUcgY29udmVyc2F0aW9uIHdpdGggSGFpa3VcblxuIyMgQWxlcnQgVGhyZXNob2xkc1xuLSBMYW1iZGEgZXJyb3IgcmF0ZSA+IDUlXG4tIExhbWJkYSBkdXJhdGlvbiA+IDgwJSBvZiB0aW1lb3V0XG4tIER5bmFtb0RCIHRocm90dGxpbmcgZXZlbnRzXG4tIFN0dWR5Qm9vayBETFEgZGVwdGggPiAwYCxcbiAgICAgIHdpZHRoOiAyNCxcbiAgICAgIGhlaWdodDogOCxcbiAgICB9KTtcblxuICAgIHRoaXMuc3lzdGVtRGFzaGJvYXJkLmFkZFdpZGdldHMoc3lzdGVtSGVhbHRoV2lkZ2V0KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlQWxhcm1zKHByb3BzOiBQZGZDb252ZXJzYXRpb25Nb25pdG9yaW5nU3RhY2tQcm9wcykge1xuICAgIGNvbnN0IGxhbWJkYUZ1bmN0aW9ucyA9IFtcbiAgICAgIHsgbmFtZTogJ0RvY3VtZW50SW5nZXN0aW9uJywgZnVuYzogcHJvcHMuZG9jdW1lbnRJbmdlc3Rpb25GdW5jdGlvbiwgdGltZW91dFRocmVzaG9sZDogMjQwIH0sXG4gICAgICB7IG5hbWU6ICdEb2N1bWVudFNlYXJjaCcsIGZ1bmM6IHByb3BzLnF1ZXJ5UHJvY2Vzc2luZ0Z1bmN0aW9uLCB0aW1lb3V0VGhyZXNob2xkOiAyNCB9LFxuICAgICAgeyBuYW1lOiAnU3R1ZHlCb29rJywgZnVuYzogcHJvcHMuc3R1ZHlCb29rRnVuY3Rpb24sIHRpbWVvdXRUaHJlc2hvbGQ6IDcyMCB9LFxuICAgICAgeyBuYW1lOiAnVGV4dHJhY3RSZXN1bHRzJywgZnVuYzogcHJvcHMudGV4dHJhY3RSZXN1bHRzUHJvY2Vzc29yRnVuY3Rpb24sIHRpbWVvdXRUaHJlc2hvbGQ6IDcyMCB9LFxuICAgICAgeyBuYW1lOiAnQmVkcm9ja1ZlY3Rvcml6YXRpb24nLCBmdW5jOiBwcm9wcy5iZWRyb2NrVmVjdG9yaXphdGlvbkZ1bmN0aW9uLCB0aW1lb3V0VGhyZXNob2xkOiAyNDAgfSxcbiAgICAgIHsgbmFtZTogJ0NvbnZlcnNhdGlvbkZ1bmN0aW9uJywgZnVuYzogcHJvcHMuY29udmVyc2F0aW9uRnVuY3Rpb24sIHRpbWVvdXRUaHJlc2hvbGQ6IDQ4IH0sXG4gICAgXTtcblxuICAgIGxhbWJkYUZ1bmN0aW9ucy5mb3JFYWNoKCh7IG5hbWUsIGZ1bmMsIHRpbWVvdXRUaHJlc2hvbGQgfSkgPT4ge1xuICAgICAgLy8gSGlnaCBFcnJvciBSYXRlIEFsYXJtXG4gICAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtuYW1lfUhpZ2hFcnJvclJhdGVgLCB7XG4gICAgICAgIGFsYXJtTmFtZTogYCR7cHJvcHMuZW52Q29uZmlnLnByZWZpeH1QREYtQ29udmVyc2F0aW9uLSR7bmFtZX0tSGlnaEVycm9yUmF0ZWAsXG4gICAgICAgIGFsYXJtRGVzY3JpcHRpb246IGBIaWdoIGVycm9yIHJhdGUgZGV0ZWN0ZWQgZm9yICR7bmFtZX0gZnVuY3Rpb25gLFxuICAgICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0xhbWJkYScsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXG4gICAgICAgICAgZGltZW5zaW9uc01hcDogeyBGdW5jdGlvbk5hbWU6IGZ1bmMuZnVuY3Rpb25OYW1lIH0sXG4gICAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICB9KSxcbiAgICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICB9KS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgICAvLyBIaWdoIER1cmF0aW9uIEFsYXJtXG4gICAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCBgJHtuYW1lfUhpZ2hEdXJhdGlvbmAsIHtcbiAgICAgICAgYWxhcm1OYW1lOiBgJHtwcm9wcy5lbnZDb25maWcucHJlZml4fVBERi1Db252ZXJzYXRpb24tJHtuYW1lfS1IaWdoRHVyYXRpb25gLFxuICAgICAgICBhbGFybURlc2NyaXB0aW9uOiBgSGlnaCBkdXJhdGlvbiBkZXRlY3RlZCBmb3IgJHtuYW1lfSBmdW5jdGlvbmAsXG4gICAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnRHVyYXRpb24nLFxuICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRnVuY3Rpb25OYW1lOiBmdW5jLmZ1bmN0aW9uTmFtZSB9LFxuICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIH0pLFxuICAgICAgICB0aHJlc2hvbGQ6IHRpbWVvdXRUaHJlc2hvbGQgKiAxMDAwLCAvLyBDb252ZXJ0IHRvIG1pbGxpc2Vjb25kc1xuICAgICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkcsXG4gICAgICB9KS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuICAgIH0pO1xuXG5cbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnU3R1ZHlCb29rRGxxRGVwdGgnLCB7XG4gICAgICBhbGFybU5hbWU6IGAke3Byb3BzLmVudkNvbmZpZy5wcmVmaXh9UERGLUNvbnZlcnNhdGlvbi1TdHVkeUJvb2stRExRLURlcHRoYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdTdHVkeUJvb2sgRExRIGhhcyBtZXNzYWdlcyDigJQgc3VtbWFyeSBnZW5lcmF0aW9uIGZhaWx1cmVzIGRldGVjdGVkJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL1NRUycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdBcHByb3hpbWF0ZU51bWJlck9mTWVzc2FnZXNWaXNpYmxlJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDogeyBRdWV1ZU5hbWU6IHByb3BzLnN0dWR5Qm9va0RscS5xdWV1ZU5hbWUgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkdSRUFURVJfVEhBTl9PUl9FUVVBTF9UT19USFJFU0hPTEQsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICB9KS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaEFjdGlvbnMuU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gRHluYW1vREIgVGhyb3R0bGluZyBBbGFybXNcbiAgICBbcHJvcHMubWV0YWRhdGFUYWJsZSwgcHJvcHMucXVlcnlMb2dzVGFibGVdLmZvckVhY2goKHRhYmxlLCBpbmRleCkgPT4ge1xuICAgICAgY29uc3QgdGFibGVOYW1lID0gaW5kZXggPT09IDAgPyAnTWV0YWRhdGEnIDogJ1F1ZXJ5TG9ncyc7XG5cbiAgICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsIGAke3RhYmxlTmFtZX1SZWFkVGhyb3R0bGluZ2AsIHtcbiAgICAgICAgYWxhcm1OYW1lOiBgJHtwcm9wcy5lbnZDb25maWcucHJlZml4fVBERi1Db252ZXJzYXRpb24tJHt0YWJsZU5hbWV9LVJlYWRUaHJvdHRsaW5nYCxcbiAgICAgICAgYWxhcm1EZXNjcmlwdGlvbjogYFJlYWQgdGhyb3R0bGluZyBkZXRlY3RlZCBmb3IgJHt0YWJsZU5hbWV9IHRhYmxlYCxcbiAgICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ1JlYWRUaHJvdHRsZUV2ZW50cycsXG4gICAgICAgICAgZGltZW5zaW9uc01hcDogeyBUYWJsZU5hbWU6IHRhYmxlLnRhYmxlTmFtZSB9LFxuICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgfSksXG4gICAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HLFxuICAgICAgfSkuYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2hBY3Rpb25zLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlUHJvZEJ1c2luZXNzTW9uaXRvcmluZyhwcm9wczogUGRmQ29udmVyc2F0aW9uTW9uaXRvcmluZ1N0YWNrUHJvcHMpIHtcbiAgICB0aGlzLmFsZXJ0VG9waWMuYWRkVG9SZXNvdXJjZVBvbGljeShuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdidWRnZXRzLmFtYXpvbmF3cy5jb20nKV0sXG4gICAgICBhY3Rpb25zOiBbJ1NOUzpQdWJsaXNoJ10sXG4gICAgICByZXNvdXJjZXM6IFt0aGlzLmFsZXJ0VG9waWMudG9waWNBcm5dLFxuICAgIH0pKTtcblxuICAgIG5ldyBidWRnZXRzLkNmbkJ1ZGdldCh0aGlzLCAnQmVkcm9ja01vbnRobHlCdWRnZXQnLCB7XG4gICAgICBidWRnZXQ6IHtcbiAgICAgICAgYnVkZ2V0TmFtZTogJ2ZvbGlvLWJlZHJvY2stbW9udGhseScsXG4gICAgICAgIGJ1ZGdldFR5cGU6ICdDT1NUJyxcbiAgICAgICAgdGltZVVuaXQ6ICdNT05USExZJyxcbiAgICAgICAgYnVkZ2V0TGltaXQ6IHsgYW1vdW50OiAyMCwgdW5pdDogJ1VTRCcgfSxcbiAgICAgICAgY29zdEZpbHRlcnM6IHsgU2VydmljZTogWydBbWF6b24gQmVkcm9jayddIH0sXG4gICAgICB9LFxuICAgICAgbm90aWZpY2F0aW9uc1dpdGhTdWJzY3JpYmVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgbm90aWZpY2F0aW9uOiB7XG4gICAgICAgICAgICBub3RpZmljYXRpb25UeXBlOiAnQUNUVUFMJyxcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDgwLFxuICAgICAgICAgICAgdGhyZXNob2xkVHlwZTogJ1BFUkNFTlRBR0UnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uVHlwZTogJ1NOUycsXG4gICAgICAgICAgICAgIGFkZHJlc3M6IHRoaXMuYWxlcnRUb3BpYy50b3BpY0FybixcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBidXNpbmVzc01ldHJpY3NXaWRnZXQgPSBuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcbiAgICAgIG1hcmtkb3duOiBgIyBGb2xpbyBCdXNpbmVzcyBNZXRyaWNzXG5cbiMjIFVzYWdlIExpbWl0cyAocGVyIHVzZXIsIGZyZWUgdGllcilcbi0gTW9udGhseSBidWRnZXQ6IDMsMDAwLDAwMCB0b2tlbnMgcGVyIHVzZXIgKGluZ2VzdGlvbiArIGNoYXQpXG4tIERvYyBjb3VudCBsaW1pdDogMjAgbGlmZXRpbWUgZG9jc1xuLSBEYWlseSBjaGF0OiA1MCBtZXNzYWdlcy9kYXlcblxuIyMgQmVkcm9jayBCdWRnZXQgQWxlcnRcbi0gTW9udGhseSBCZWRyb2NrIHNwZW5kIGFsZXJ0IGF0IDgwJSBvZiAkMjAgVVNEIHRocmVzaG9sZFxuLSBOb3RpZmljYXRpb24g4oaSIFNTTTovcGRmY29udi8ke3Byb3BzLmVudkNvbmZpZy5uYW1lfS9ub3RpZmljYXRpb24tZW1haWxgLFxuICAgICAgd2lkdGg6IDI0LFxuICAgICAgaGVpZ2h0OiA2LFxuICAgIH0pO1xuXG4gICAgdGhpcy5zeXN0ZW1EYXNoYm9hcmQuYWRkV2lkZ2V0cyhidXNpbmVzc01ldHJpY3NXaWRnZXQpO1xuICB9XG59Il19