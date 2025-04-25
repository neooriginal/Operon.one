// Global functions for file handling (making them accessible to onclick handlers)
window.downloadFile = function(fileId, fileName) {
    // We'll trigger a custom event that the internal function will listen for
    const event = new CustomEvent('downloadFileRequest', {
        detail: { fileId, fileName }
    });
    document.dispatchEvent(event);
};

window.viewFileContent = function(fileId, fileName) {
    // We'll trigger a custom event that the internal function will listen for
    const event = new CustomEvent('viewFileRequest', {
        detail: { fileId, fileName }
    });
    document.dispatchEvent(event);
};

document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements with null checks
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const statusDisplay = document.getElementById('status-display');
    const recentChatsList = document.getElementById('recent-chats-list');
    const newTaskButton = document.getElementById('new-task-button');

    // Initialize important variables for socket connections and global state
    const userId = localStorage.getItem('userId') || '';
    const userEmail = localStorage.getItem('userEmail') || '';
    const authToken = localStorage.getItem('authToken') || '';
    let currentChatId = localStorage.getItem('currentChatId') || 'new';
    
    // Check if we have an initial query from the welcome page
    const initialQuery = localStorage.getItem('initialQuery');

    // Redirect to login if not authenticated
    if (!userId || !authToken) {
        window.location.href = 'login.html';
        return;
    }

    // Set user info in sidebar
    const userInfoElement = document.getElementById('user-info');
    if (userInfoElement) {
        userInfoElement.textContent = `User: ${userEmail || userId}`;
    }

    // --- Socket.IO Connection ---
    // Make sure the URL matches your server (where socket.js runs)
    const socket = io('http://localhost:3000', {
         transports: ['websocket'], // Prefer WebSocket for better performance
         auth: {
             token: authToken,
             userId: userId
         }
     });

    socket.on('connect', () => {
        console.log('Connected to Socket.IO Server! ID:', socket.id);
        if (statusDisplay) {
            updateStatusDisplay('Ready', 'idle'); // Initial status
        }
        // Only load chats if we're on the chat page
        if (recentChatsList && chatMessages) {
            loadUserChats(); // Load the chats when connected
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (statusDisplay) {
            updateStatusDisplay('Connection lost', 'error');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        if (statusDisplay) {
            updateStatusDisplay(`Connection Error`, 'error');
        }
    });

    // --- Recent Chats Management ---
    async function loadUserChats() {
        try {
            const response = await fetch('/api/chats', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load chats');
            }
            
            const data = await response.json();
            
            if (recentChatsList) {
                renderChatList(data.chats);
            }
            
            // Check if we need to create a new chat with initial query
            if (initialQuery && (currentChatId === 'new' || !currentChatId) && chatMessages && messageInput) {
                console.log('Starting new chat with initial query:', initialQuery);
                chatMessages.innerHTML = '';
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');
                
                // Add the message to the input
                messageInput.value = initialQuery;
                // Clear it from localStorage to prevent reuse
                localStorage.removeItem('initialQuery');
                // Submit the message
                setTimeout(() => {
                    handleSendMessage();
                }, 100);
                return;
            }
            
            // Load current chat history if we have a chat
            if (data.chats.length > 0 && currentChatId !== 'new' && chatMessages) {
                // Find the current chat in the list, or use the first one
                let currentChat = data.chats.find(chat => chat.id == currentChatId);
                
                // If we don't have a current chat or it wasn't found
                if (!currentChat) {
                    // First look for an empty chat (chat with no messages or only system welcome)
                    const emptyChat = data.chats.find(chat => !chat.messageCount || chat.messageCount <= 1);
                    
                    if (emptyChat) {
                        // Use an existing empty chat instead of creating a new one
                        currentChat = emptyChat;
                    } else {
                        // No empty chats, use the most recent one
                        currentChat = data.chats[0];
                    }
                }
                
                currentChatId = currentChat.id;
                localStorage.setItem('currentChatId', currentChatId);
                
                // Set this chat as active in the UI
                if (recentChatsList) {
                    setActiveChatInUI(currentChatId);
                }
                
                // Load this chat's history
                loadChatHistory(currentChatId);
            } else if (chatMessages) {
                // If no chats exist or we're starting a new chat, set up for a new chat
                chatMessages.innerHTML = '';
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');
                
                // If we have an initial query from the welcome page, auto-submit it
                if (initialQuery && messageInput) {
                    messageInput.value = initialQuery;
                    // Clear it from localStorage to prevent reuse
                    localStorage.removeItem('initialQuery');
                    // Small delay to ensure UI is ready
                    setTimeout(() => {
                        handleSendMessage();
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Error loading chats:', error);
            if (recentChatsList) {
                recentChatsList.innerHTML = '<p style="padding: 15px; color: var(--gray);">Failed to load chats</p>';
            }
        }
    }
    
    function renderChatList(chats) {
        // Clear the list first
        recentChatsList.innerHTML = '';
        
        if (chats.length === 0) {
            recentChatsList.innerHTML = '<p style="padding: 15px; color: var(--gray);">No chats found</p>';
            return;
        }
        
        // Sort chats by updatedAt (most recent first)
        chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        
        // Render each chat
        chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'recent-chat-item';
            chatItem.dataset.chatId = chat.id;
            
            // Format date
            const chatDate = new Date(chat.updatedAt);
            const today = new Date();
            let timeDisplay;
            
            // Format date: Today, Yesterday, or date
            if (chatDate.toDateString() === today.toDateString()) {
                timeDisplay = 'Today';
            } else if (chatDate.toDateString() === new Date(today - 86400000).toDateString()) {
                timeDisplay = 'Yesterday';
            } else {
                timeDisplay = chatDate.toLocaleDateString();
            }
            
            chatItem.innerHTML = `
                <div class="chat-content">
                    <span class="chat-title">${chat.title}</span>
                    <span class="chat-timestamp">${timeDisplay}</span>
                </div>
                <button class="delete-chat-btn" title="Delete chat" data-chat-id="${chat.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            
            // Add click handler to the chat content to load this chat
            chatItem.querySelector('.chat-content').addEventListener('click', () => {
                currentChatId = chat.id;
                localStorage.setItem('currentChatId', currentChatId);
                setActiveChatInUI(currentChatId);
                loadChatHistory(currentChatId);
            });
            
            // Add click handler to the delete button
            chatItem.querySelector('.delete-chat-btn').addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the chat click event from firing
                deleteChat(chat.id);
            });
            
            recentChatsList.appendChild(chatItem);
        });
        
        // Set active chat
        setActiveChatInUI(currentChatId);
    }
    
    function setActiveChatInUI(chatId) {
        // Remove active class from all chats
        document.querySelectorAll('.recent-chat-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to current chat
        const activeChatItem = document.querySelector(`.recent-chat-item[data-chat-id="${chatId}"]`);
        if (activeChatItem) {
            activeChatItem.classList.add('active');
        }
    }
    
    async function loadChatHistory(chatId) {
        // If chat messages container doesn't exist, exit early
        if (!chatMessages) return;
        
        try {
            // Clear current messages
            chatMessages.innerHTML = '';
            
            const response = await fetch(`/api/chats/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load chat history');
            }
            
            const data = await response.json();
            console.log('Loaded chat history:', data.messages);
            
            // If no messages, prepare for chat but don't add welcome message
            if (data.messages.length === 0) {
                return;
            }
            
            // Display messages
            data.messages.forEach(msg => {
                // Extract message content using our utility function
                const messageContent = extractTextFromObject(msg.content);
                console.log('Processing message:', msg);
                
                // Map role to expected format - ensure 'assistant' maps to 'ai' and 'user' stays as 'user'
                let role = msg.role;
                if (role === 'assistant') {
                    role = 'ai';
                }
                
                console.log(`Adding message with role ${role}:`, messageContent);
                
                // Add message with correct role
                addMessage(messageContent, role);
                
                // Check if message was added correctly
                const lastMessageElement = chatMessages.lastElementChild;
                console.log('Added message element:', lastMessageElement);
            });
            
            // Scroll to bottom
            scrollToBottom();
        } catch (error) {
            console.error('Error loading chat history:', error);
            if (chatMessages) {
                addMessage('Failed to load chat history', 'system');
            }
        }
    }
    
    async function createNewChat() {
        try {
            // Clear current messages right away
            chatMessages.innerHTML = '';
            
            // No more welcome message here
            
            const response = await fetch('/api/chats', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ title: 'New Conversation' })
            });
            
            if (!response.ok) {
                throw new Error('Failed to create new chat');
            }
            
            const data = await response.json();
            currentChatId = data.chat.id;
            localStorage.setItem('currentChatId', currentChatId);
            
            // Reload chat list
            await loadUserChats();
            
            console.log('New chat created:', currentChatId);
            return data.chat;
        } catch (error) {
            console.error('Error creating new chat:', error);
            updateStatusDisplay('Failed to create new chat', 'error');
        }
    }
    
    // Only add event listeners if the elements exist
    if (sendButton && messageInput) {
        sendButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleSendMessage();
            }
        });
    }
    
    // Only add the new task button event listener if it exists
    if (newTaskButton) {
        newTaskButton.addEventListener('click', () => {
            // Only proceed if chatMessages exists (we're on the chat page)
            if (chatMessages) {
                // Clear the chat messages but don't actually create a new chat yet
                chatMessages.innerHTML = '';
                
                // Don't add welcome message anymore
                
                // Set currentChatId to 'new' to indicate we need to create a chat when user sends message
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');
                
                // Clear any active chat in the list
                document.querySelectorAll('.recent-chat-item').forEach(item => {
                    item.classList.remove('active');
                });
                
                // Focus the message input if it exists
                if (messageInput) {
                    messageInput.focus();
                }
            } else {
                // We're not on the chat page, redirect to index.html
                window.location.href = 'index.html';
            }
        });
    }

    // Update the status display with text and appropriate icon based on status type
    function updateStatusDisplay(text, statusType = 'info') {
        if (!statusDisplay) return;

        let iconHtml = '';
        statusDisplay.classList.remove('active'); // Reset active class

        switch (statusType) {
            case 'loading':
            case 'status_update':
                iconHtml = getIconForType('status_update'); // Spinner icon
                statusDisplay.classList.add('active'); // Highlight background when active
                break;
            case 'idle':
                iconHtml = '<i class="fas fa-check"></i>'; // Simple checkmark for ready state
                break;
            case 'completed':
                iconHtml = getIconForType('task_completed');
                break;
            case 'error':
                iconHtml = getIconForType('task_error');
                break;
            default:
                iconHtml = ''; // No icon for simple info
        }

        statusDisplay.innerHTML = `${iconHtml} <span>${text || '-'}</span>`;
    }

    // Helper function to verify and fix message element structure if needed
    function verifyMessageStructure(messageElement) {
        // Check if message has the correct class structure
        if (!messageElement.classList.contains('message')) {
            console.warn('Message element missing "message" class, adding it');
            messageElement.classList.add('message');
        }
        
        // Ensure message has a content div
        if (!messageElement.querySelector('.message-content')) {
            console.warn('Message element missing content div, restructuring');
            
            // Get all of the element's content
            const content = messageElement.innerHTML;
            
            // Clear the element
            messageElement.innerHTML = '';
            
            // Create a content div
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('message-content');
            contentDiv.innerHTML = content;
            
            // Add the content div to the message
            messageElement.appendChild(contentDiv);
        }
        
        return messageElement;
    }

    // Helper function to extract text content from different message object formats
    function extractTextFromObject(messageObj) {
        if (typeof messageObj === 'string') {
            return messageObj;
        }
        
        if (typeof messageObj !== 'object' || messageObj === null) {
            return String(messageObj);
        }
        
        // If it has a text property, use that
        if (messageObj.text) {
            return messageObj.text;
        }
        
        // If it has a result property (AI tool response format)
        if (messageObj.result) {
            return messageObj.result;
        }
        
        // If it's an array of content objects (like OpenAI format)
        if (Array.isArray(messageObj) && messageObj.length > 0) {
            const textContent = messageObj
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join("\n");
            
            if (textContent) {
                return textContent;
            }
        }
        
        // Fallback: stringify the object
        return JSON.stringify(messageObj, null, 2);
    }

    function addMessage(text, sender, type = 'text') {
        // If chat messages container doesn't exist, exit early
        if (!chatMessages) return;
        
        // Process text to ensure it's a string
        const messageText = extractTextFromObject(text);
        
        const messageElement = document.createElement('div');
        
        if (sender === 'system') {
            messageElement.classList.add('message', 'system');
            if (type === 'html') {
                // Render as HTML when type is explicitly 'html'
                messageElement.innerHTML = messageText;
            } else {
                // Default to treating as plain text
                messageElement.textContent = messageText;
            }
        } else {
            // Important: Use the correct classes for styling
            // 'message' for the container, then 'user' or 'ai' for the role
            messageElement.classList.add('message', sender);
            
            // Create message content container
            const contentElement = document.createElement('div');
            contentElement.classList.add('message-content');
            
            if (sender === 'ai') {
                // Parse Markdown für AI-Nachrichten
                try {
                    // Setze Optionen für Marked (optional, z.B. für GitHub Flavored Markdown)
                    marked.setOptions({
                        gfm: true,
                        breaks: true // Konvertiert Zeilenumbrüche in <br>
                    });
                    contentElement.innerHTML = marked.parse(messageText);
                } catch (e) {
                    console.error("Fehler beim Parsen von Markdown:", e);
                    contentElement.textContent = messageText; // Fallback auf reinen Text
                }
            } else {
                contentElement.textContent = messageText; // Benutzernachrichten bleiben Text
            }
            
            messageElement.appendChild(contentElement);
        }
        
        // Verify the message structure before adding to DOM
        verifyMessageStructure(messageElement);
        
        chatMessages.appendChild(messageElement);
        scrollToBottom();
    }

    function addActionElement(title, content, type = 'default', parentElement = chatMessages) {
        const actionElement = document.createElement('div');
        actionElement.classList.add('action-element', `action-${type}`);
        actionElement.dataset.actionType = type; // Typ als Data-Attribut speichern

        const iconElement = document.createElement('div');
        iconElement.classList.add('action-icon');

        let iconHtml = getIconForType(type);
        iconElement.innerHTML = iconHtml;

        const detailsElement = document.createElement('div');
        detailsElement.classList.add('action-details');

        const titleElement = document.createElement('div');
        titleElement.classList.add('action-title');
        titleElement.textContent = title;

        const contentElement = document.createElement('div');
        contentElement.classList.add('action-content');
        contentElement.innerHTML = content; // Erlaube HTML im Inhalt

        detailsElement.appendChild(titleElement);
        detailsElement.appendChild(contentElement);

        actionElement.appendChild(iconElement);
        actionElement.appendChild(detailsElement);

        parentElement.appendChild(actionElement);
        scrollToBottomIfNeeded(parentElement);

        return actionElement; // Rückgabe für mögliche spätere Updates (z.B. Status)
    }

    function addStepGroup(title, initiallyCollapsed = false, parentElement = chatMessages) {
        const stepGroup = document.createElement('div');
        stepGroup.classList.add('step-group');
        
        const titleElement = document.createElement('div');
        titleElement.classList.add('step-group-title');
        titleElement.innerHTML = `
            <span>${title}</span>
            <i class="fas ${initiallyCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
        `;
        
        const contentElement = document.createElement('div');
        contentElement.classList.add('step-group-content');
        
        if (initiallyCollapsed) {
            contentElement.style.display = 'none';
        }
        
        titleElement.addEventListener('click', () => {
            const isCollapsed = contentElement.style.display === 'none';
            contentElement.style.display = isCollapsed ? 'block' : 'none';
            titleElement.querySelector('i').className = `fas ${isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down'}`;
        });
        
        stepGroup.appendChild(titleElement);
        stepGroup.appendChild(contentElement);
        parentElement.appendChild(stepGroup);
        scrollToBottomIfNeeded(parentElement);
        
        return contentElement; // Content-Container zurückgeben
    }

    function getIconForType(type) {
        // Icon-Logik (ausgelagert für Wiederverwendbarkeit)
        let iconHtml = '<i class="fas fa-question-circle"></i>';
        switch (type) {
            case 'file-creation':
            case 'file-update':
            case 'filesystem':
                iconHtml = '<i class="fas fa-file-alt"></i>'; break;
            case 'web-search':
            case 'deep-research':
                iconHtml = '<i class="fas fa-search"></i>'; break;
            case 'web-browser':
                iconHtml = '<i class="fas fa-globe"></i>'; break;
            case 'execute':
            case 'python':
                iconHtml = '<i class="fas fa-terminal"></i>'; break;
            case 'bash':
                iconHtml = '<i class="fas fa-terminal"></i>'; break;
            case 'writer':
                iconHtml = '<i class="fas fa-pencil-alt"></i>'; break;
            case 'plan-step':
                iconHtml = '<i class="fas fa-tasks"></i>'; break;
            case 'chat-completion':
                 iconHtml = '<i class="fas fa-brain"></i>'; break;
            case 'image-generation':
                 iconHtml = '<i class="fas fa-image"></i>'; break;
            case 'math':
                 iconHtml = '<i class="fas fa-calculator"></i>'; break;
             case 'task_received':
                  iconHtml = '<i class="fas fa-inbox"></i>'; break;
             case 'status_update':
                  iconHtml = '<i class="fas fa-spinner fa-spin"></i>'; break; // Lade-Spinner
             case 'step_completed':
                  iconHtml = '<i class="fas fa-check-circle"></i>'; break; // Erfolg
             case 'task_completed':
                   iconHtml = '<i class="fas fa-flag-checkered"></i>'; break; // Ziel
             case 'task_error':
                   iconHtml = '<i class="fas fa-exclamation-triangle"></i>'; break; // Fehler
        }
        return iconHtml;
    }

    function scrollToBottom() {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function scrollToBottomIfNeeded(parentElement) {
        // Nur scrollen, wenn das Element direkt zum Haupt-Chat hinzugefügt wird
        if (parentElement === chatMessages && chatMessages) {
            scrollToBottom();
        }
    }

    // Handle sending a message from the input field
    function handleSendMessage() {
        // Check if required elements exist
        if (!messageInput || !chatMessages) return;
        
        const message = messageInput.value.trim();
        if (!message) return;

        // Process functions common to both new and existing chats
        const processSendMessage = (chatId) => {
            // Add message to UI
            addMessage(message, 'user');
            messageInput.value = '';
            
            // Show loading indicator
            updateStatusDisplay('Processing your request...', 'loading');
            
            // Submit to server with user ID and chat ID
            socket.emit('submit_task', { 
                task: message,
                userId: userId,
                chatId: chatId
            });
            
            // Disable input while processing
            if (messageInput && sendButton) {
                messageInput.disabled = true;
                sendButton.disabled = true;
            }
        };

        // If this is a new chat without an ID, create it first
        if (!currentChatId || currentChatId === 'new') {
            createNewChat().then(() => {
                processSendMessage(currentChatId);
                // Try to update the chat title based on this first message
                updateChatTitleFromContent(currentChatId, message);
            });
        } else {
            // For existing chats, just process the message
            processSendMessage(currentChatId);
            
            // If this is the first message in a chat, update the title
            if (document.querySelectorAll('.message.user-message').length === 1) {
                updateChatTitleFromContent(currentChatId, message);
            }
        }
    }

    // Helper function to check if a message already exists in the chat
    function isDuplicateMessage(messageText, maxMessagesToCheck = 3) {
        if (!chatMessages) return false;
        
        const messages = chatMessages.querySelectorAll('.message.ai');
        if (messages.length === 0) return false;
        
        // Check the last few AI messages to avoid duplicates
        const messagesToCheck = Math.min(messages.length, maxMessagesToCheck);
        for (let i = messages.length - 1; i >= messages.length - messagesToCheck; i--) {
            const msgContent = messages[i].querySelector('.message-content');
            if (msgContent && msgContent.textContent.trim() === messageText.trim()) {
                console.log('Preventing duplicate message');
                return true;
            }
        }
        
        return false;
    }

    // Update the socket.on('ai_message') handler to fix duplicate messages and improve chat titles
    socket.on('ai_message', (data) => {
        try {
            // Only update UI if this message is for the current chat
            if (data.chatId && data.chatId !== currentChatId) return;
            
            // Handle if text is an object
            const messageText = extractTextFromObject(data.text);
            
            // Don't add message if it's empty
            if (!messageText || messageText.trim() === '') {
                console.log('Ignoring empty message');
                return;
            }
            
            // Check for duplicate messages
            if (isDuplicateMessage(messageText)) return;
            
            // For new chats: Only add the AI message if it's not the welcome message 
            // that we've already added in createNewChat()
            const welcomeText = "Hello! I'm your Operon.one assistant. How can I help you today?";
            if (messageText.includes(welcomeText) && document.querySelector('.message.ai .message-content')?.textContent.includes(welcomeText)) {
                console.log('Skipping welcome message in new chat');
                return;
            }
            
            // Add the message to the UI
            addMessage(messageText, 'ai');
        } catch (error) {
            console.error('Error processing AI message:', error);
            updateStatusDisplay('Error processing message', 'error');
        }
    });

    // Function to update chat title based on content
    function updateChatTitleFromContent(chatId, messageText) {
        // Don't attempt to update title if we don't have a valid chat ID
        if (!chatId || chatId === 'new') return;
        
        // Use the provided message text as the title basis
        // This is the first user message in a new chat
        let title = messageText;
        
        // Limit to a reasonable length
        if (title.length > 40) {
            title = title.substring(0, 37) + '...';
        }
        
        // Update the title in the current chat list item
        const chatListItem = document.querySelector(`.recent-chat-item[data-chat-id="${chatId}"]`);
        if (chatListItem) {
            const chatTitle = chatListItem.querySelector('.chat-title');
            if (chatTitle) {
                chatTitle.textContent = title;
            }
        }
        
        // Update the title in the database
        updateChatTitle(chatId, title);
    }

    // Update chat title in the database
    async function updateChatTitle(chatId, title) {
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({ title })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update chat title');
            }
            
            // Update the UI
            const chatItem = document.querySelector(`.recent-chat-item[data-chat-id="${chatId}"]`);
            if (chatItem) {
                const titleElement = chatItem.querySelector('.chat-title');
                if (titleElement) {
                    titleElement.textContent = title;
                }
            }
        } catch (error) {
            console.error('Error updating chat title:', error);
        }
    }

    // Listener für Status-Updates
    socket.on('status_update', (data) => {
        // Only process events for the current user
        if (data.userId === userId) {
            console.log('Status update:', data);
            updateStatusDisplay(data.status || 'Processing...', 'status_update');
        }
    });

    // Listener für detaillierte Schritt-Informationen (Plan)
    let stepGroups = {}; // Speichert Referenzen zu Gruppen-Content-Elementen

    socket.on('steps', (data) => {
        // Erwartet data.plan als Array von Schritten
        if (data.plan && Array.isArray(data.plan)) {
            updateStatusDisplay('Plan received', 'info'); // Kurze Info im Status
            stepGroups = {}; // Reset für neuen Plan
            const planGroupContent = addStepGroup(`Plan (${data.plan.length} Steps)`, false);
            data.plan.forEach((step, index) => {
                const stepId = `step-${index}`; // Eindeutige ID für den Schritt
                // Füge den Schritt als Unter-Element hinzu
                const actionEl = addActionElement(
                    `Step ${index + 1}: ${step.step || 'Unnamed Step'}`, // Titel
                    `Action: ${step.action || 'N/A'}<br>Expected: ${step.expectedOutput || 'N/A'}`, // Inhalt
                    'plan-step', // Typ
                    planGroupContent // Elternelement
                );
                actionEl.dataset.stepId = stepId; // Speichere ID am Element
            });
        }
    });

    // Listener für abgeschlossene Schritte (zum Aktualisieren des Status)
    socket.on('step_completed', (data) => {
        // Only process events for the current user
        if (data.userId === userId) {
            console.log('Step completed:', data);
            updateStatusDisplay(`Step ${data.metrics.stepIndex + 1}/${data.metrics.totalSteps} completed: ${data.step}`, 'status_update');
            const stepId = `step-${data.metrics.stepIndex}`;
            const stepElement = chatMessages.querySelector(`.action-element[data-step-id="${stepId}"]`);
            if (stepElement) {
                // Icon auf 'erledigt' ändern
                const iconContainer = stepElement.querySelector('.action-icon');
                if (iconContainer) {
                    iconContainer.innerHTML = getIconForType('step_completed');
                     iconContainer.style.color = '#28a745'; // Grün für Erfolg
                }
                // Optional: Weitere Details hinzufügen oder Stil ändern
                stepElement.style.opacity = '0.7'; // Leicht ausblenden
            }
            // Kein separates addActionElement mehr hier
        }
    });

    // Listener for task completion - UPDATED with type check and using isDuplicateMessage
    socket.on('task_completed', (data) => {
        try {
            // Only process events for the current user
            if (data.userId === userId) {
                console.log('Task completed:', data);
                
                // Handle if result is an object
                const result = extractTextFromObject(data.result) || 'Task completed successfully';
                
                // Check if this result was already added by the ai_message event
                if (!isDuplicateMessage(result)) {
                    addMessage(result, 'ai');
                }
                
                // Display output files if any
                if (data.outputFiles && 
                   ((data.outputFiles.host && data.outputFiles.host.length > 0) || 
                   (data.outputFiles.container && data.outputFiles.container.length > 0))) {
                    const filesHtml = generateFilesHtml(data.outputFiles);
                    addMessage(`<div class="file-output">
                        <div class="file-header">
                            <i class="fas fa-file-alt"></i> Task Output Files
                        </div>
                        <div class="file-list">
                            ${filesHtml}
                        </div>
                    </div>`, 'system', 'html');
                }
                
                updateStatusDisplay('Task completed', 'completed');
                
                // Re-enable input
                messageInput.disabled = false;
                sendButton.disabled = false;
                
                // Add a final summary action element (optional)
                const metricsSummary = data.metrics ? `${data.metrics.successCount}/${data.metrics.totalSteps} steps successful.` : '';
                const durationSummary = data.duration ? `Duration: ${(data.duration / 1000).toFixed(1)}s.` : '';
                addActionElement('Task Summary', `${durationSummary} ${metricsSummary}`.trim(), 'task_completed');
            }
        } catch (error) {
            console.error('Error processing task completion:', error);
            updateStatusDisplay('Error completing task', 'error');
        }
    });

    // Function to generate HTML for file list
    function generateFilesHtml(files) {
        if (!files || (!files.host || files.host.length === 0) && (!files.container || files.container.length === 0)) {
            return '<p>No files generated.</p>';
        }

        let html = '<div class="file-output-container">';

        const generateList = (title, fileList) => {
            if (!fileList || fileList.length === 0) return '';
            
            let listHtml = `<h3>${title}</h3><ul>`;
            fileList.forEach(file => {
                const fileExtension = file.extension || file.fileName?.split('.').pop() || '';
                const isTextBased = ['txt', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'c', 'cpp', 'md'].includes(fileExtension.toLowerCase());
                
                listHtml += `
                    <li>
                        <span class="file-name">${file.fileName || 'Unnamed File'}</span>
                        <span class="file-path">(${file.path || 'N/A'})</span>
                        <div class="file-actions">
                            <button class="file-action-btn download-btn" onclick="downloadFile('${file.id}', '${file.fileName || `download_${file.id}`}')">Download</button>
                            ${isTextBased ? `<button class="file-action-btn view-btn" onclick="viewFileContent('${file.id}', '${file.fileName || 'File Preview'}')">View</button>` : ''}
                        </div>
                    </li>
                `;
            });
            listHtml += '</ul>';
            return listHtml;
        };

        html += generateList('Host Files', files.host);
        html += generateList('Container Files', files.container);
        html += '</div>';

        return html;
    }

    // Helper function to escape HTML (basic version)
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
    }

    // Listener für Fehler
    socket.on('task_error', (data) => {
        // Only process events for the current user
        if (data.userId === userId) {
            console.error('Task error:', data);
            addActionElement('Error', data.error, 'error');
            updateStatusDisplay('Task failed', 'error');
            
            // Re-enable input
            messageInput.disabled = false;
            sendButton.disabled = false;
        }
    });

    // --- Event listening for socket.io events ---
    socket.on('task_received', (data) => {
        // Only process events for the current user
        if (data.userId === userId) {
            console.log('Task received:', data);
            updateStatusDisplay('Task received', 'status_update');
        }
    });

    // --- Initiales Setup oder Beispiel entfernen ---
    // Die alten setTimeout Beispiele werden entfernt, da alles über Sockets läuft.

    // Beispiel: Initiale Nachricht anzeigen
    // addMessage("Hallo! Verbinde mit Operon.one...", 'ai');

    // Add event listener for logout button
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('userId');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentChatId');
            window.location.href = '/login';
        });
    }

    // Add new deleteChat function
    async function deleteChat(chatId) {
        if (!confirm('Are you sure you want to delete this chat?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete chat');
            }
            
            // If deleting the current chat, create a new chat or switch to another
            if (chatId == currentChatId) {
                // Clear current chat display
                if (chatMessages) {
                    chatMessages.innerHTML = '';
                }
                
                // Set to 'new' to create a new chat when needed
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');
            }
            
            // Reload the chat list
            await loadUserChats();
            
            // Update status
            if (statusDisplay) {
                updateStatusDisplay('Chat deleted successfully', 'success');
                // Reset after a moment
                setTimeout(() => {
                    updateStatusDisplay('Ready', 'idle');
                }, 2000);
            }
        } catch (error) {
            console.error('Error deleting chat:', error);
            if (statusDisplay) {
                updateStatusDisplay('Failed to delete chat: ' + error.message, 'error');
            }
        }
    }

    // Add event listeners for file handling events
    document.addEventListener('downloadFileRequest', (e) => {
        const { fileId, fileName } = e.detail;
        const token = localStorage.getItem('token') || authToken;
        handleFileDownload(fileId, fileName, token);
    });
    
    document.addEventListener('viewFileRequest', (e) => {
        const { fileId, fileName } = e.detail;
        const token = localStorage.getItem('token') || authToken;
        handleFileView(fileId, fileName, token);
    });
    
    // Internal function handling file download
    async function handleFileDownload(fileId, fileName, token) {
        try {
            const response = await fetch(`/api/files/${fileId}/download`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                // Try to get error message from response body
                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {
                    // Ignore if response body isn't JSON
                }
                throw new Error(errorMsg);
            }

            // Get the file content as a Blob
            const blob = await response.blob();

            // Create a temporary URL for the Blob
            const url = window.URL.createObjectURL(blob);

            // Create an invisible anchor element
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Use the provided fileName for the download attribute
            a.download = fileName;

            // Append the anchor to the body, click it, and remove it
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Error downloading file:', error);
            // Inform the user about the error (e.g., using the modal or another notification)
            showModal(`<p class="error-message">Error downloading file: ${error.message}</p>`, 'Download Error');
        }
    }
    
    // Internal function handling file view
    async function handleFileView(fileId, fileName, token) {
        // Show loading state in modal
        showModal('Loading file content...', `Loading: ${fileName}`);

        try {
            const response = await fetch(`/api/files/${fileId}/download`, { // Use download endpoint to get content
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to load file content' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const fileContent = await response.text(); // Assume text for viewing
            
            // Display content in modal with pre-wrap
            const contentHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(fileContent)}</pre>`;
            showModal(contentHtml, `Preview: ${fileName}`);

        } catch (error) {         
            console.error('Error viewing file content:', error);
            showModal(`<p class="error-message">Error loading file: ${error.message}</p>`, 'Error');
        }
    }

    // Function to show modal
    function showModal(content, title = 'Information') {
        const modal = document.getElementById('file-modal');
        const modalTitle = document.getElementById('modal-title');
        const modalBody = document.getElementById('modal-body');
        const modalClose = document.querySelector('.modal-close');

        if (!modal || !modalTitle || !modalBody || !modalClose) {
            console.error('Modal elements not found!');
            return;
        }

        modalTitle.textContent = title;
        modalBody.innerHTML = content; // Allows HTML content
        modal.style.display = 'flex'; // Show modal

        // Close modal functionality
        modalClose.onclick = () => {
            modal.style.display = 'none';
        };
        // Optional: Close modal when clicking outside the content
        modal.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
}); 