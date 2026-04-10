import React, { useState, useRef } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';

function UploadZone({ onUploadComplete }) {
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

      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      const apiEndpoint = awsConfig.API.REST.PdfConversationApi.endpoint;

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

      const { presigned_url } = await presignedResponse.json();

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
      setMessage(`Successfully uploaded ${file.name}! The document will be processed automatically.`);
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
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
  );
}

export default UploadZone;