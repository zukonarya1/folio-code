import React, { useState, useRef } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';

function Upload({ user }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setMessage(null);
    } else {
      setError('Please select a PDF file');
      setFile(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
      setMessage(null);
    } else {
      setError('Please drop a PDF file');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    try {
      setUploading(true);
      setProgress(0);
      setError(null);
      setMessage(null);

      // Get auth token
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      // Get API endpoint from aws-config
      const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;

      // Get presigned URL
      setProgress(10);
      const presignedResponse = await fetch(`${apiEndpoint}/upload/presigned`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          content_type: 'application/pdf',
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { presigned_url, document_id } = await presignedResponse.json();

      // Upload file to S3
      setProgress(30);
      const uploadResponse = await fetch(presigned_url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setProgress(100);
      setMessage(`Successfully uploaded ${file.name}! Document ID: ${document_id}. Processing will begin automatically.`);
      setFile(null);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-page">
      <div className="card">
        <h2>Upload Document</h2>
        <p>Upload a PDF document to be processed and vectorized for semantic search.</p>

        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}

        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            ref={fileInputRef}
          />
          <div className="w-16 h-16 border-[1.5px] border-blade rounded-full mx-auto mb-4 bg-blade-surface" />
          {file ? (
            <div>
              <p><strong>{file.name}</strong></p>
              <p>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p>Drag and drop a PDF file here</p>
              <p>or click to browse</p>
            </div>
          )}
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="h-1.5 w-full bg-blade-bar-track rounded-full overflow-hidden">
              <div className="h-full bg-blade-accent rounded-full transition-all duration-300 relative overflow-hidden" style={{ width: `${progress}%` }}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="font-body text-blade-timestamp text-blade-text-muted">Uploading...</span>
              <span className="font-mono text-blade-timestamp font-bold text-blade-accent">{progress}%</span>
            </div>
          </div>
        )}

        <button
          className="btn btn-primary mt-4 w-full"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>

      <div className="w-24 h-px bg-blade-border mx-auto opacity-50 my-8" />

      <div className="card">
        <h2>Processing Pipeline</h2>
        <p>After upload, your document will go through the following stages:</p>
        <div className="flex flex-wrap justify-center gap-8 md:gap-12 mt-6">
          <div className="text-center">
            <span className="block font-mono text-blade-timestamp text-blade-text-faint mb-2">(01)</span>
            <div className="w-12 h-12 rounded-full border-[1.5px] border-blade-accent mx-auto mb-3 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-blade-accent" />
            </div>
            <span className="block font-body text-blade-body-sm font-medium text-blade-text leading-tight">Upload</span>
          </div>
          <div className="text-center">
            <span className="block font-mono text-blade-timestamp text-blade-text-faint mb-2">(02)</span>
            <div className="w-12 h-12 rounded-full border-[1.5px] border-blade-accent mx-auto mb-3 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-transparent" />
            </div>
            <span className="block font-body text-blade-body-sm font-medium text-blade-text-muted leading-tight">OCR</span>
          </div>
          <div className="text-center">
            <span className="block font-mono text-blade-timestamp text-blade-text-faint mb-2">(03)</span>
            <div className="w-12 h-12 rounded-full border-[1.5px] border-blade-accent mx-auto mb-3 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-transparent" />
            </div>
            <span className="block font-body text-blade-body-sm font-medium text-blade-text-muted leading-tight">Processing</span>
          </div>
          <div className="text-center">
            <span className="block font-mono text-blade-timestamp text-blade-text-faint mb-2">(04)</span>
            <div className="w-12 h-12 rounded-full border-[1.5px] border-blade-accent mx-auto mb-3 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-transparent" />
            </div>
            <span className="block font-body text-blade-body-sm font-medium text-blade-text-muted leading-tight">Vectorization</span>
          </div>
          <div className="text-center">
            <span className="block font-mono text-blade-timestamp text-blade-text-faint mb-2">(05)</span>
            <div className="w-12 h-12 rounded-full border-[1.5px] border-blade-accent mx-auto mb-3 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-transparent" />
            </div>
            <span className="block font-body text-blade-body-sm font-medium text-blade-text-muted leading-tight">Indexing</span>
          </div>
        </div>
        <p className="mt-4 text-blade-text-faint text-blade-body-sm">
          This process typically takes 1-5 minutes depending on document size.
        </p>
      </div>
    </div>
  );
}

export default Upload;
