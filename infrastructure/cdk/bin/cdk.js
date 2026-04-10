#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib"));
const pdf_conversation_infra_stack_1 = require("../lib/pdf-conversation-infra-stack");
const pdf_conversation_security_stack_1 = require("../lib/pdf-conversation-security-stack");
const app = new cdk.App();
// Environment configuration
const envConfig = {
    account: '198945929229',
    region: 'us-west-2',
};
// Deploy stacks in dependency order
const securityStack = new pdf_conversation_security_stack_1.PdfConversationSecurityStack(app, 'PdfConversationSecurityStack', {
    env: envConfig,
    accountId: envConfig.account,
    region: envConfig.region,
    description: 'IAM roles and policies for PDF Conversation system',
});
const infraStack = new pdf_conversation_infra_stack_1.PdfConversationInfraStack(app, 'PdfConversationInfraStack', {
    env: envConfig,
    description: 'Core infrastructure for PDF Conversation system',
});
// Add dependency to ensure security stack deploys first
infraStack.addDependency(securityStack);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2RrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiY2RrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0EsaURBQW1DO0FBQ25DLHNGQUFnRjtBQUNoRiw0RkFBc0Y7QUFFdEYsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsNEJBQTRCO0FBQzVCLE1BQU0sU0FBUyxHQUFHO0lBQ2hCLE9BQU8sRUFBRSxjQUFjO0lBQ3ZCLE1BQU0sRUFBRSxXQUFXO0NBQ3BCLENBQUM7QUFFRixvQ0FBb0M7QUFDcEMsTUFBTSxhQUFhLEdBQUcsSUFBSSw4REFBNEIsQ0FBQyxHQUFHLEVBQUUsOEJBQThCLEVBQUU7SUFDMUYsR0FBRyxFQUFFLFNBQVM7SUFDZCxTQUFTLEVBQUUsU0FBUyxDQUFDLE9BQU87SUFDNUIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO0lBQ3hCLFdBQVcsRUFBRSxvREFBb0Q7Q0FDbEUsQ0FBQyxDQUFDO0FBRUgsTUFBTSxVQUFVLEdBQUcsSUFBSSx3REFBeUIsQ0FBQyxHQUFHLEVBQUUsMkJBQTJCLEVBQUU7SUFDakYsR0FBRyxFQUFFLFNBQVM7SUFDZCxXQUFXLEVBQUUsaURBQWlEO0NBQy9ELENBQUMsQ0FBQztBQUVILHdEQUF3RDtBQUN4RCxVQUFVLENBQUMsYUFBYSxDQUFDLGFBQWEsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFBkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2sgfSBmcm9tICcuLi9saWIvcGRmLWNvbnZlcnNhdGlvbi1pbmZyYS1zdGFjayc7XG5pbXBvcnQgeyBQZGZDb252ZXJzYXRpb25TZWN1cml0eVN0YWNrIH0gZnJvbSAnLi4vbGliL3BkZi1jb252ZXJzYXRpb24tc2VjdXJpdHktc3RhY2snO1xuXG5jb25zdCBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuXG4vLyBFbnZpcm9ubWVudCBjb25maWd1cmF0aW9uXG5jb25zdCBlbnZDb25maWcgPSB7XG4gIGFjY291bnQ6ICcxOTg5NDU5MjkyMjknLFxuICByZWdpb246ICd1cy13ZXN0LTInLFxufTtcblxuLy8gRGVwbG95IHN0YWNrcyBpbiBkZXBlbmRlbmN5IG9yZGVyXG5jb25zdCBzZWN1cml0eVN0YWNrID0gbmV3IFBkZkNvbnZlcnNhdGlvblNlY3VyaXR5U3RhY2soYXBwLCAnUGRmQ29udmVyc2F0aW9uU2VjdXJpdHlTdGFjaycsIHtcbiAgZW52OiBlbnZDb25maWcsXG4gIGFjY291bnRJZDogZW52Q29uZmlnLmFjY291bnQsXG4gIHJlZ2lvbjogZW52Q29uZmlnLnJlZ2lvbixcbiAgZGVzY3JpcHRpb246ICdJQU0gcm9sZXMgYW5kIHBvbGljaWVzIGZvciBQREYgQ29udmVyc2F0aW9uIHN5c3RlbScsXG59KTtcblxuY29uc3QgaW5mcmFTdGFjayA9IG5ldyBQZGZDb252ZXJzYXRpb25JbmZyYVN0YWNrKGFwcCwgJ1BkZkNvbnZlcnNhdGlvbkluZnJhU3RhY2snLCB7XG4gIGVudjogZW52Q29uZmlnLFxuICBkZXNjcmlwdGlvbjogJ0NvcmUgaW5mcmFzdHJ1Y3R1cmUgZm9yIFBERiBDb252ZXJzYXRpb24gc3lzdGVtJyxcbn0pO1xuXG4vLyBBZGQgZGVwZW5kZW5jeSB0byBlbnN1cmUgc2VjdXJpdHkgc3RhY2sgZGVwbG95cyBmaXJzdFxuaW5mcmFTdGFjay5hZGREZXBlbmRlbmN5KHNlY3VyaXR5U3RhY2spOyJdfQ==