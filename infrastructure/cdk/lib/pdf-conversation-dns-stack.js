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
exports.PdfConversationDnsStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
class PdfConversationDnsStack extends cdk.Stack {
    hostedZone;
    certificate;
    constructor(scope, id, props) {
        super(scope, id, props);
        this.hostedZone = new route53.PublicHostedZone(this, 'SubdomainHostedZone', {
            zoneName: props.domainName,
        });
        this.certificate = new acm.Certificate(this, 'SubdomainCertificate', {
            domainName: props.domainName,
            validation: acm.CertificateValidation.fromDns(this.hostedZone),
        });
        new cr.AwsCustomResource(this, 'CertArnSsmWriter', {
            onCreate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: {
                    Name: `/pdfconv/${props.envName}/cert-arn`,
                    Value: this.certificate.certificateArn,
                    Type: 'String',
                    Overwrite: true,
                },
                region: 'us-west-2',
                physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/cert-arn`),
            },
            onUpdate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: {
                    Name: `/pdfconv/${props.envName}/cert-arn`,
                    Value: this.certificate.certificateArn,
                    Type: 'String',
                    Overwrite: true,
                },
                region: 'us-west-2',
                physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/cert-arn`),
            },
            onDelete: {
                service: 'SSM',
                action: 'deleteParameter',
                parameters: { Name: `/pdfconv/${props.envName}/cert-arn` },
                region: 'us-west-2',
                ignoreErrorCodesMatching: 'ParameterNotFound',
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
                    resources: [
                        `arn:aws:ssm:us-west-2:${this.account}:parameter/pdfconv/${props.envName}/cert-arn`,
                    ],
                }),
            ]),
        });
        new cr.AwsCustomResource(this, 'ZoneIdSsmWriter', {
            onCreate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: {
                    Name: `/pdfconv/${props.envName}/hosted-zone-id`,
                    Value: this.hostedZone.hostedZoneId,
                    Type: 'String',
                    Overwrite: true,
                },
                region: 'us-west-2',
                physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/hosted-zone-id`),
            },
            onUpdate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: {
                    Name: `/pdfconv/${props.envName}/hosted-zone-id`,
                    Value: this.hostedZone.hostedZoneId,
                    Type: 'String',
                    Overwrite: true,
                },
                region: 'us-west-2',
                physicalResourceId: cr.PhysicalResourceId.of(`/pdfconv/${props.envName}/hosted-zone-id`),
            },
            onDelete: {
                service: 'SSM',
                action: 'deleteParameter',
                parameters: { Name: `/pdfconv/${props.envName}/hosted-zone-id` },
                region: 'us-west-2',
                ignoreErrorCodesMatching: 'ParameterNotFound',
            },
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new iam.PolicyStatement({
                    actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
                    resources: [
                        `arn:aws:ssm:us-west-2:${this.account}:parameter/pdfconv/${props.envName}/hosted-zone-id`,
                    ],
                }),
            ]),
        });
        new cdk.CfnOutput(this, 'SubdomainHostedZoneId', {
            value: this.hostedZone.hostedZoneId,
        });
        new cdk.CfnOutput(this, 'SubdomainNameServers', {
            value: cdk.Fn.join(',', this.hostedZone.hostedZoneNameServers),
        });
        new cdk.CfnOutput(this, 'AcmCertificateArn', {
            value: this.certificate.certificateArn,
        });
    }
}
exports.PdfConversationDnsStack = PdfConversationDnsStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGRmLWNvbnZlcnNhdGlvbi1kbnMtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJwZGYtY29udmVyc2F0aW9uLWRucy1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxpRUFBbUQ7QUFDbkQsd0VBQTBEO0FBQzFELGlFQUFtRDtBQUNuRCx5REFBMkM7QUFRM0MsTUFBYSx1QkFBd0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUNwQyxVQUFVLENBQTJCO0lBQ3JDLFdBQVcsQ0FBa0I7SUFFN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQztRQUMzRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksT0FBTyxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUMxRSxRQUFRLEVBQUUsS0FBSyxDQUFDLFVBQVU7U0FDM0IsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQ25FLFVBQVUsRUFBRSxLQUFLLENBQUMsVUFBVTtZQUM1QixVQUFVLEVBQUUsR0FBRyxDQUFDLHFCQUFxQixDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO1NBQy9ELENBQUMsQ0FBQztRQUVILElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNqRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLFVBQVUsRUFBRTtvQkFDVixJQUFJLEVBQUUsWUFBWSxLQUFLLENBQUMsT0FBTyxXQUFXO29CQUMxQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO29CQUN0QyxJQUFJLEVBQUUsUUFBUTtvQkFDZCxTQUFTLEVBQUUsSUFBSTtpQkFDaEI7Z0JBQ0QsTUFBTSxFQUFFLFdBQVc7Z0JBQ25CLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsWUFBWSxLQUFLLENBQUMsT0FBTyxXQUFXLENBQUM7YUFDbkY7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLFVBQVUsRUFBRTtvQkFDVixJQUFJLEVBQUUsWUFBWSxLQUFLLENBQUMsT0FBTyxXQUFXO29CQUMxQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO29CQUN0QyxJQUFJLEVBQUUsUUFBUTtvQkFDZCxTQUFTLEVBQUUsSUFBSTtpQkFDaEI7Z0JBQ0QsTUFBTSxFQUFFLFdBQVc7Z0JBQ25CLGtCQUFrQixFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLENBQUMsWUFBWSxLQUFLLENBQUMsT0FBTyxXQUFXLENBQUM7YUFDbkY7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGlCQUFpQjtnQkFDekIsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksS0FBSyxDQUFDLE9BQU8sV0FBVyxFQUFFO2dCQUMxRCxNQUFNLEVBQUUsV0FBVztnQkFDbkIsd0JBQXdCLEVBQUUsbUJBQW1CO2FBQzlDO1lBQ0QsTUFBTSxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUM7Z0JBQ2hELElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsT0FBTyxFQUFFLENBQUMsa0JBQWtCLEVBQUUscUJBQXFCLENBQUM7b0JBQ3BELFNBQVMsRUFBRTt3QkFDVCx5QkFBeUIsSUFBSSxDQUFDLE9BQU8sc0JBQXNCLEtBQUssQ0FBQyxPQUFPLFdBQVc7cUJBQ3BGO2lCQUNGLENBQUM7YUFDSCxDQUFDO1NBQ0gsQ0FBQyxDQUFDO1FBRUgsSUFBSSxFQUFFLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ2hELFFBQVEsRUFBRTtnQkFDUixPQUFPLEVBQUUsS0FBSztnQkFDZCxNQUFNLEVBQUUsY0FBYztnQkFDdEIsVUFBVSxFQUFFO29CQUNWLElBQUksRUFBRSxZQUFZLEtBQUssQ0FBQyxPQUFPLGlCQUFpQjtvQkFDaEQsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsWUFBWTtvQkFDbkMsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsU0FBUyxFQUFFLElBQUk7aUJBQ2hCO2dCQUNELE1BQU0sRUFBRSxXQUFXO2dCQUNuQixrQkFBa0IsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLFlBQVksS0FBSyxDQUFDLE9BQU8saUJBQWlCLENBQUM7YUFDekY7WUFDRCxRQUFRLEVBQUU7Z0JBQ1IsT0FBTyxFQUFFLEtBQUs7Z0JBQ2QsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLFVBQVUsRUFBRTtvQkFDVixJQUFJLEVBQUUsWUFBWSxLQUFLLENBQUMsT0FBTyxpQkFBaUI7b0JBQ2hELEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVk7b0JBQ25DLElBQUksRUFBRSxRQUFRO29CQUNkLFNBQVMsRUFBRSxJQUFJO2lCQUNoQjtnQkFDRCxNQUFNLEVBQUUsV0FBVztnQkFDbkIsa0JBQWtCLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxZQUFZLEtBQUssQ0FBQyxPQUFPLGlCQUFpQixDQUFDO2FBQ3pGO1lBQ0QsUUFBUSxFQUFFO2dCQUNSLE9BQU8sRUFBRSxLQUFLO2dCQUNkLE1BQU0sRUFBRSxpQkFBaUI7Z0JBQ3pCLFVBQVUsRUFBRSxFQUFFLElBQUksRUFBRSxZQUFZLEtBQUssQ0FBQyxPQUFPLGlCQUFpQixFQUFFO2dCQUNoRSxNQUFNLEVBQUUsV0FBVztnQkFDbkIsd0JBQXdCLEVBQUUsbUJBQW1CO2FBQzlDO1lBQ0QsTUFBTSxFQUFFLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUM7Z0JBQ2hELElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztvQkFDdEIsT0FBTyxFQUFFLENBQUMsa0JBQWtCLEVBQUUscUJBQXFCLENBQUM7b0JBQ3BELFNBQVMsRUFBRTt3QkFDVCx5QkFBeUIsSUFBSSxDQUFDLE9BQU8sc0JBQXNCLEtBQUssQ0FBQyxPQUFPLGlCQUFpQjtxQkFDMUY7aUJBQ0YsQ0FBQzthQUNILENBQUM7U0FDSCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHVCQUF1QixFQUFFO1lBQy9DLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLFlBQVk7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxzQkFBc0IsRUFBRTtZQUM5QyxLQUFLLEVBQUUsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMscUJBQXNCLENBQUM7U0FDaEUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjO1NBQ3ZDLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQWhIRCwwREFnSEMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFBkZkNvbnZlcnNhdGlvbkRuc1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHJlYWRvbmx5IGRvbWFpbk5hbWU6IHN0cmluZztcbiAgcmVhZG9ubHkgZW52TmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUGRmQ29udmVyc2F0aW9uRG5zU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgaG9zdGVkWm9uZTogcm91dGU1My5QdWJsaWNIb3N0ZWRab25lO1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU6IGFjbS5DZXJ0aWZpY2F0ZTtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogUGRmQ29udmVyc2F0aW9uRG5zU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgdGhpcy5ob3N0ZWRab25lID0gbmV3IHJvdXRlNTMuUHVibGljSG9zdGVkWm9uZSh0aGlzLCAnU3ViZG9tYWluSG9zdGVkWm9uZScsIHtcbiAgICAgIHpvbmVOYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgIH0pO1xuXG4gICAgdGhpcy5jZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ1N1YmRvbWFpbkNlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogcHJvcHMuZG9tYWluTmFtZSxcbiAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyh0aGlzLmhvc3RlZFpvbmUpLFxuICAgIH0pO1xuXG4gICAgbmV3IGNyLkF3c0N1c3RvbVJlc291cmNlKHRoaXMsICdDZXJ0QXJuU3NtV3JpdGVyJywge1xuICAgICAgb25DcmVhdGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ3B1dFBhcmFtZXRlcicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgICAgICBOYW1lOiBgL3BkZmNvbnYvJHtwcm9wcy5lbnZOYW1lfS9jZXJ0LWFybmAsXG4gICAgICAgICAgVmFsdWU6IHRoaXMuY2VydGlmaWNhdGUuY2VydGlmaWNhdGVBcm4sXG4gICAgICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICAgICAgT3ZlcndyaXRlOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICByZWdpb246ICd1cy13ZXN0LTInLFxuICAgICAgICBwaHlzaWNhbFJlc291cmNlSWQ6IGNyLlBoeXNpY2FsUmVzb3VyY2VJZC5vZihgL3BkZmNvbnYvJHtwcm9wcy5lbnZOYW1lfS9jZXJ0LWFybmApLFxuICAgICAgfSxcbiAgICAgIG9uVXBkYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdTU00nLFxuICAgICAgICBhY3Rpb246ICdwdXRQYXJhbWV0ZXInLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgTmFtZTogYC9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vY2VydC1hcm5gLFxuICAgICAgICAgIFZhbHVlOiB0aGlzLmNlcnRpZmljYXRlLmNlcnRpZmljYXRlQXJuLFxuICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIE92ZXJ3cml0ZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVnaW9uOiAndXMtd2VzdC0yJyxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YoYC9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vY2VydC1hcm5gKSxcbiAgICAgIH0sXG4gICAgICBvbkRlbGV0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnU1NNJyxcbiAgICAgICAgYWN0aW9uOiAnZGVsZXRlUGFyYW1ldGVyJyxcbiAgICAgICAgcGFyYW1ldGVyczogeyBOYW1lOiBgL3BkZmNvbnYvJHtwcm9wcy5lbnZOYW1lfS9jZXJ0LWFybmAgfSxcbiAgICAgICAgcmVnaW9uOiAndXMtd2VzdC0yJyxcbiAgICAgICAgaWdub3JlRXJyb3JDb2Rlc01hdGNoaW5nOiAnUGFyYW1ldGVyTm90Rm91bmQnLFxuICAgICAgfSxcbiAgICAgIHBvbGljeTogY3IuQXdzQ3VzdG9tUmVzb3VyY2VQb2xpY3kuZnJvbVN0YXRlbWVudHMoW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgYWN0aW9uczogWydzc206UHV0UGFyYW1ldGVyJywgJ3NzbTpEZWxldGVQYXJhbWV0ZXInXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIGBhcm46YXdzOnNzbTp1cy13ZXN0LTI6JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vY2VydC1hcm5gLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgXSksXG4gICAgfSk7XG5cbiAgICBuZXcgY3IuQXdzQ3VzdG9tUmVzb3VyY2UodGhpcywgJ1pvbmVJZFNzbVdyaXRlcicsIHtcbiAgICAgIG9uQ3JlYXRlOiB7XG4gICAgICAgIHNlcnZpY2U6ICdTU00nLFxuICAgICAgICBhY3Rpb246ICdwdXRQYXJhbWV0ZXInLFxuICAgICAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICAgICAgTmFtZTogYC9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vaG9zdGVkLXpvbmUtaWRgLFxuICAgICAgICAgIFZhbHVlOiB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZUlkLFxuICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIE92ZXJ3cml0ZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVnaW9uOiAndXMtd2VzdC0yJyxcbiAgICAgICAgcGh5c2ljYWxSZXNvdXJjZUlkOiBjci5QaHlzaWNhbFJlc291cmNlSWQub2YoYC9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vaG9zdGVkLXpvbmUtaWRgKSxcbiAgICAgIH0sXG4gICAgICBvblVwZGF0ZToge1xuICAgICAgICBzZXJ2aWNlOiAnU1NNJyxcbiAgICAgICAgYWN0aW9uOiAncHV0UGFyYW1ldGVyJyxcbiAgICAgICAgcGFyYW1ldGVyczoge1xuICAgICAgICAgIE5hbWU6IGAvcGRmY29udi8ke3Byb3BzLmVudk5hbWV9L2hvc3RlZC16b25lLWlkYCxcbiAgICAgICAgICBWYWx1ZTogdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVJZCxcbiAgICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICBPdmVyd3JpdGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHJlZ2lvbjogJ3VzLXdlc3QtMicsXG4gICAgICAgIHBoeXNpY2FsUmVzb3VyY2VJZDogY3IuUGh5c2ljYWxSZXNvdXJjZUlkLm9mKGAvcGRmY29udi8ke3Byb3BzLmVudk5hbWV9L2hvc3RlZC16b25lLWlkYCksXG4gICAgICB9LFxuICAgICAgb25EZWxldGU6IHtcbiAgICAgICAgc2VydmljZTogJ1NTTScsXG4gICAgICAgIGFjdGlvbjogJ2RlbGV0ZVBhcmFtZXRlcicsXG4gICAgICAgIHBhcmFtZXRlcnM6IHsgTmFtZTogYC9wZGZjb252LyR7cHJvcHMuZW52TmFtZX0vaG9zdGVkLXpvbmUtaWRgIH0sXG4gICAgICAgIHJlZ2lvbjogJ3VzLXdlc3QtMicsXG4gICAgICAgIGlnbm9yZUVycm9yQ29kZXNNYXRjaGluZzogJ1BhcmFtZXRlck5vdEZvdW5kJyxcbiAgICAgIH0sXG4gICAgICBwb2xpY3k6IGNyLkF3c0N1c3RvbVJlc291cmNlUG9saWN5LmZyb21TdGF0ZW1lbnRzKFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGFjdGlvbnM6IFsnc3NtOlB1dFBhcmFtZXRlcicsICdzc206RGVsZXRlUGFyYW1ldGVyJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpzc206dXMtd2VzdC0yOiR7dGhpcy5hY2NvdW50fTpwYXJhbWV0ZXIvcGRmY29udi8ke3Byb3BzLmVudk5hbWV9L2hvc3RlZC16b25lLWlkYCxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIF0pLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N1YmRvbWFpbkhvc3RlZFpvbmVJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmhvc3RlZFpvbmUuaG9zdGVkWm9uZUlkLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N1YmRvbWFpbk5hbWVTZXJ2ZXJzJywge1xuICAgICAgdmFsdWU6IGNkay5Gbi5qb2luKCcsJywgdGhpcy5ob3N0ZWRab25lLmhvc3RlZFpvbmVOYW1lU2VydmVycyEpLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FjbUNlcnRpZmljYXRlQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuY2VydGlmaWNhdGUuY2VydGlmaWNhdGVBcm4sXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==