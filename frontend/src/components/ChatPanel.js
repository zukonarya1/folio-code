import React, { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import awsConfig from '../aws-config';
import ReactMarkdown from 'react-markdown';

const MAX_TEXTAREA_HEIGHT = 200;

function ChatPanel({ documentId, user }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [conversationsLoaded, setConversationsLoaded] = useState(false);
  const [showConversationList, setShowConversationList] = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const getAuthHeaders = async () => {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const getApiEndpoint = () => {
    return awsConfig.API.REST.PdfConversationApi.endpoint;
  };

  const fetchConversations = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const endpoint = getApiEndpoint();
      const response = await fetch(
        `${endpoint}/documents/${documentId}/conversations`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to load conversations');
      const data = await response.json();
      const list = Array.isArray(data) ? data : data.conversations || [];
      setConversations(list);
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setConversationsLoaded(true);
    }
  }, [documentId]);

  const loadConversation = useCallback(async (convId) => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const endpoint = getApiEndpoint();
      const response = await fetch(
        `${endpoint}/documents/${documentId}/conversations/${convId}`,
        { headers }
      );
      if (!response.ok) throw new Error('Failed to load conversation');
      const data = await response.json();
      setActiveConversation(data);
    } catch (err) {
      setError(err.message);
    }
  }, [documentId]);

  useEffect(() => {
    if (!documentId || conversationsLoaded) return;
    let cancelled = false;
    fetchConversations().then((list) => {
      if (cancelled) return;
      if (list.length > 0) {
        const mostRecent = list[0];
        loadConversation(mostRecent.conversation_id || mostRecent.id);
      }
    });
    return () => { cancelled = true; };
  }, [documentId, conversationsLoaded, fetchConversations, loadConversation]);

  const messages = activeConversation?.messages || [];

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, sending]);

  const resizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    ta.style.overflowY = ta.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  };

  const handleInputChange = (e) => {
    setMessage(e.target.value);
    resizeTextarea();
  };

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;

    setError(null);
    setMessage('');
    setSending(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const userMessage = { role: 'user', content: text };
    setActiveConversation((prev) => ({
      ...prev,
      messages: [...(prev?.messages || []), userMessage],
    }));

    try {
      const headers = await getAuthHeaders();
      const endpoint = getApiEndpoint();
      const body = { message: text };
      if (activeConversation?.conversation_id || activeConversation?.id) {
        body.conversation_id = activeConversation.conversation_id || activeConversation.id;
      }

      const response = await fetch(
        `${endpoint}/documents/${documentId}/conversations`,
        { method: 'POST', headers, body: JSON.stringify(body) }
      );

      if (!response.ok) throw new Error('Failed to send message');
      const data = await response.json();

      const assistantContent = data.response || data.message || data.content || '';
      const assistantMessage = { role: 'assistant', content: assistantContent };

      setActiveConversation((prev) => {
        const updated = {
          ...prev,
          conversation_id: data.conversation_id || prev?.conversation_id,
          id: data.conversation_id || prev?.id,
          messages: [...(prev?.messages || []), assistantMessage],
        };
        return updated;
      });

      if (!body.conversation_id) {
        setConversationsLoaded(false);
      }
    } catch (err) {
      setError(err.message);
      setActiveConversation((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), { role: 'assistant', content: 'Sorry, something went wrong.' }],
      }));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewConversation = () => {
    setActiveConversation(null);
    setError(null);
    setMessage('');
    setShowConversationList(false);
  };

  const selectConversation = (conv) => {
    loadConversation(conv.conversation_id || conv.id);
    setShowConversationList(false);
  };

  const title = activeConversation?.title
    || activeConversation?.conversation_id
    || (messages.length > 0 ? 'Conversation' : 'New conversation');

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-left">
          {conversations.length > 1 && (
            <div className="chat-conversation-selector">
              <button
                className="chat-conversation-toggle"
                onClick={() => setShowConversationList((v) => !v)}
              >
                {conversations.length} chats ▾
              </button>
              {showConversationList && (
                <div className="chat-conversation-dropdown">
                  {conversations.map((conv) => (
                    <button
                      key={conv.conversation_id || conv.id}
                      className="chat-conversation-item"
                      onClick={() => selectConversation(conv)}
                    >
                      {conv.title || conv.conversation_id || conv.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <span className="chat-title">{title}</span>
        </div>
        <button className="chat-new-btn" onClick={startNewConversation}>
          New Chat
        </button>
      </div>

      {error && <div className="chat-error">{error}</div>}

      <div className="chat-messages">
        {messages.length === 0 && !sending && (
          <div className="chat-empty">Ask a question about this document.</div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${msg.role}`}>
            {msg.role === 'assistant' ? (
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            ) : (
              msg.content
            )}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble chat-bubble-assistant chat-loading">
            <span className="chat-loading-dot"></span>
            <span className="chat-loading-dot"></span>
            <span className="chat-loading-dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this document..."
          rows={1}
          disabled={sending}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={sending || !message.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;