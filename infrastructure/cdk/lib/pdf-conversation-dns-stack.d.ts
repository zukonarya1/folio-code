import * as cdk from 'aws-cdk-lib';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
export interface PdfConversationDnsStackProps extends cdk.StackProps {
    readonly domainName: string;
    readonly envName: string;
}
export declare class PdfConversationDnsStack extends cdk.Stack {
    readonly hostedZone: route53.PublicHostedZone;
    readonly certificate: acm.Certificate;
    constructor(scope: Construct, id: string, props: PdfConversationDnsStackProps);
}
