window.downloadFile = function (fileId, fileName) {

    const event = new CustomEvent('downloadFileRequest', {
        detail: { fileId, fileName }
    });
    document.dispatchEvent(event);
};

window.viewFileContent = function (fileId, fileName) {

    const event = new CustomEvent('viewFileRequest', {
        detail: { fileId, fileName }
    });
    document.dispatchEvent(event);
};

document.addEventListener('DOMContentLoaded', () => {

    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const statusDisplay = document.getElementById('status-display');
    const recentChatsList = document.getElementById('recent-chats-list');
    const newTaskButton = document.getElementById('new-task-button');
    const sidebar = document.querySelector('.sidebar');

    // Add sidebar toggle button for mobile
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader) {
        const toggleButton = document.createElement('button');
        toggleButton.className = 'sidebar-toggle';
        toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
        toggleButton.setAttribute('aria-label', 'Toggle sidebar');
        sidebarHeader.appendChild(toggleButton);

        // Handle sidebar toggle
        toggleButton.addEventListener('click', () => {
            sidebar.classList.toggle('expanded');
            toggleButton.innerHTML = sidebar.classList.contains('expanded') ?
                '<i class="fas fa-times"></i>' :
                '<i class="fas fa-bars"></i>';
        });

        // Close sidebar when clicking outside
        document.addEventListener('click', (event) => {
            const isClickInside = sidebar.contains(event.target);
            if (!isClickInside && window.innerWidth <= 768 && sidebar.classList.contains('expanded')) {
                sidebar.classList.remove('expanded');
                toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
            }
        });
    }

    // Handle mobile keyboard adjustments
    if (messageInput) {
        messageInput.addEventListener('focus', () => {
            if (window.innerWidth <= 768) {
                // Add a small delay to allow the keyboard to show up
                setTimeout(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                    if (chatMessages) {
                        chatMessages.scrollTop = chatMessages.scrollHeight;
                    }
                }, 300);
            }
        });
    }

    // Improve mobile scrolling
    let touchStartY;
    if (chatMessages) {
        chatMessages.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        chatMessages.addEventListener('touchmove', (e) => {
            if (!touchStartY) {
                return;
            }

            const touchY = e.touches[0].clientY;
            const isScrollingUp = touchY > touchStartY;
            const isAtTop = chatMessages.scrollTop === 0;
            const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop === chatMessages.clientHeight;

            // Prevent pull-to-refresh when at the top
            if (isAtTop && isScrollingUp) {
                e.preventDefault();
            }

            // Prevent overscroll when at the bottom
            if (isAtBottom && !isScrollingUp) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    // Adjust viewport height for mobile browsers
    function adjustViewportHeight() {
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }

    window.addEventListener('resize', adjustViewportHeight);
    window.addEventListener('orientationchange', () => {
        setTimeout(adjustViewportHeight, 100);
    });
    adjustViewportHeight();

    const userId = localStorage.getItem('userId') || '';
    const userEmail = localStorage.getItem('userEmail') || '';
    const authToken = localStorage.getItem('authToken') || '';
    let currentChatId = localStorage.getItem('currentChatId') || 'new';
    
    const initialQuery = localStorage.getItem('initialQuery');


    if (!userId || !authToken) {
        window.location.href = 'login.html';
        return;
    }


    const userInfoElement = document.getElementById('user-info');
    if (userInfoElement) {
        userInfoElement.textContent = `User: ${userEmail || userId}`;
    }





    const socket = io(window.location.origin, {
        transports: ['websocket'],
        auth: {
            token: authToken,
            userId: userId
        }
    });

    socket.on('connect', () => {
        console.log('Connected to Socket.IO Server! ID:', socket.id);
        if (statusDisplay) {
            updateStatusDisplay('Ready', 'idle');
        }
        
        // Load chats if we have the chat interface active, otherwise just load for sidebar
        if (chatMessages && document.getElementById('chat-interface') && document.getElementById('chat-interface').classList.contains('active')) {
            loadUserChats();
        } else if (recentChatsList) {
            // Just load chats for sidebar without initializing chat interface
            loadUserChatsForSidebar();
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

    // Listen for custom loadChat event from the combined interface
    window.addEventListener('loadChat', (event) => {
        const { chatId } = event.detail;
        currentChatId = chatId;
        localStorage.setItem('currentChatId', currentChatId);
        if (recentChatsList) {
            setActiveChatInUI(currentChatId);
        }
        loadChatHistory(currentChatId);
    });

    // Expose functions globally for the combined interface
    window.loadChatHistory = loadChatHistory;
    window.loadUserChats = loadUserChats;

    // Function to handle initial query when chat interface becomes active
    window.handleInitialQuery = function () {
        const storedInitialQuery = localStorage.getItem('initialQuery');
        if (storedInitialQuery && chatMessages && messageInput) {
            console.log('Handling initial query:', storedInitialQuery);
            chatMessages.innerHTML = '';
            currentChatId = 'new';
            localStorage.setItem('currentChatId', 'new');

            messageInput.value = storedInitialQuery;
            localStorage.removeItem('initialQuery');

            setTimeout(() => {
                handleSendMessage();
            }, 100);
        }
    };

    // Function to load chats only for sidebar (used in welcome screen)
    async function loadUserChatsForSidebar() {
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
        } catch (error) {
            console.error('Error loading chats:', error);
            if (recentChatsList) {
                recentChatsList.innerHTML = '<p style="padding: 15px; color: var(--gray);">Failed to load chats</p>';
            }
        }
    }


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


            if (initialQuery && (currentChatId === 'new' || !currentChatId) && chatMessages && messageInput) {
                console.log('Starting new chat with initial query:', initialQuery);
                chatMessages.innerHTML = '';
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');


                messageInput.value = initialQuery;

                localStorage.removeItem('initialQuery');

                setTimeout(() => {
                    handleSendMessage();
                }, 100);
                return;
            }


            if (data.chats.length > 0 && currentChatId !== 'new' && chatMessages) {

                let currentChat = data.chats.find(chat => chat.id == currentChatId);


                if (!currentChat) {

                    const emptyChat = data.chats.find(chat => !chat.messageCount || chat.messageCount <= 1);

                    if (emptyChat) {

                        currentChat = emptyChat;
                    } else {

                        currentChat = data.chats[0];
                    }
                }

                currentChatId = currentChat.id;
                localStorage.setItem('currentChatId', currentChatId);


                if (recentChatsList) {
                    setActiveChatInUI(currentChatId);
                }


                loadChatHistory(currentChatId);
            } else if (chatMessages) {

                chatMessages.innerHTML = '';
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');


                if (initialQuery && messageInput) {
                    messageInput.value = initialQuery;

                    localStorage.removeItem('initialQuery');

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

        recentChatsList.innerHTML = '';

        if (chats.length === 0) {
            recentChatsList.innerHTML = '<p style="padding: 15px; color: var(--gray);">No chats found</p>';
            return;
        }


        chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));


        chats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'recent-chat-item';
            chatItem.dataset.chatId = chat.id;


            const chatDate = new Date(chat.updatedAt);
            const today = new Date();
            let timeDisplay;


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


            chatItem.querySelector('.chat-content').addEventListener('click', () => {
                // Reset any loading flags and clear state when switching chats
                window.isLoadingHistory = false;

                currentChatId = chat.id;
                localStorage.setItem('currentChatId', currentChatId);
                setActiveChatInUI(currentChatId);

                // Check if we're in the combined interface
                const chatInterface = document.getElementById('chat-interface');
                const welcomeScreen = document.getElementById('welcome-screen');

                if (chatInterface && welcomeScreen) {
                    // We're in the combined interface, show chat interface
                    welcomeScreen.classList.add('hidden');
                    chatInterface.classList.add('active');
                }

                loadChatHistory(currentChatId);
            });


            chatItem.querySelector('.delete-chat-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
            });

            recentChatsList.appendChild(chatItem);
        });


        setActiveChatInUI(currentChatId);
    }

    function setActiveChatInUI(chatId) {

        document.querySelectorAll('.recent-chat-item').forEach(item => {
            item.classList.remove('active');
        });


        const activeChatItem = document.querySelector(`.recent-chat-item[data-chat-id="${chatId}"]`);
        if (activeChatItem) {
            activeChatItem.classList.add('active');
        }
    }

    async function loadChatHistory(chatId) {

        if (!chatMessages) return;

        try {
            // Set a flag to prevent socket events from adding messages during history loading
            window.isLoadingHistory = true;

            // Clear any existing messages and reset step groups
            chatMessages.innerHTML = '';
            stepGroups = {};

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
            console.log('Loaded task steps:', data.taskSteps);


            if (data.messages.length === 0) {
                window.isLoadingHistory = false;
                return;
            }

            // Process messages in chronological order, but handle task visualization specially
            const processedMessages = [];
            let hasTaskSteps = data.taskSteps && data.taskSteps.length > 0;
            let taskVisualizationAdded = false;

            // Keep track of processed message contents to avoid duplicates
            const processedContents = new Set();

            data.messages.forEach((msg, index) => {
                const messageContent = extractTextFromObject(msg.content);

                // Skip JSON responses and "Processing your task..." messages
                if (isJsonResponse(messageContent) ||
                    messageContent.includes('Processing your task') ||
                    messageContent.trim() === '') {
                    return;
                }

                // Skip if we've already processed this exact content
                const contentKey = `${msg.role}:${messageContent.trim()}`;
                if (processedContents.has(contentKey)) {
                    console.log('Skipping duplicate message during history load:', messageContent.substring(0, 50) + '...');
                    return;
                }
                processedContents.add(contentKey);

                let role = msg.role;
                if (role === 'assistant') {
                    role = 'ai';
                }

                processedMessages.push({ content: messageContent, role: role, originalIndex: index });
            });

            // Add messages in order, inserting task visualization after the first user message
            processedMessages.forEach((msg, index) => {
                addMessage(msg.content, msg.role);

                // Add task visualization after the first user message (if it exists and hasn't been added yet)
                if (hasTaskSteps && !taskVisualizationAdded && msg.role === 'user' && index === 0) {
                    reconstructTaskVisualization(data.taskSteps);
                    taskVisualizationAdded = true;
                }
            });

            // If no user messages but we have task steps, add them now
            if (hasTaskSteps && !taskVisualizationAdded) {
                reconstructTaskVisualization(data.taskSteps);
            }

            // Load and display files for this chat
            await loadChatFiles(chatId);

            // Clear the loading flag after a short delay to allow any pending socket events to be ignored
            setTimeout(() => {
                window.isLoadingHistory = false;
            }, 1000);


            scrollToBottom();
        } catch (error) {
            console.error('Error loading chat history:', error);
            window.isLoadingHistory = false;
            if (chatMessages) {
                addMessage('Failed to load chat history', 'system');
            }
        }
    }

    /**
     * Reconstructs task visualization from stored task steps
     * @param {Array} taskSteps - Array of task step objects from database
     */
    function reconstructTaskVisualization(taskSteps) {
        if (!taskSteps || taskSteps.length === 0) return;

        // Group steps by their original plan (assuming they're from the same task)
        const planSteps = taskSteps.map(step => ({
            step: step.stepData.step,
            action: step.stepData.action,
            expectedOutput: step.stepData.expectedOutput,
            status: step.stepStatus,
            stepIndex: step.stepIndex
        }));

        // Sort by step index to maintain order
        planSteps.sort((a, b) => a.stepIndex - b.stepIndex);

        // Create the plan visualization
        stepGroups = {}; // Reset step groups
        const planGroupContent = addStepGroup(`Plan (${planSteps.length} Steps)`, false);

        planSteps.forEach((step, index) => {
            const stepId = `step-${index}`;

            const actionEl = addActionElement(
                `Step ${index + 1}: ${step.step || 'Unnamed Step'}`,
                `Action: ${step.action || 'N/A'}<br>Expected: ${step.expectedOutput || 'N/A'}`,
                'plan-step',
                planGroupContent
            );
            actionEl.dataset.stepId = stepId;

            // Apply completed styling if step was completed
            if (step.status === 'completed') {
                const iconContainer = actionEl.querySelector('.action-icon');
                if (iconContainer) {
                    iconContainer.innerHTML = getIconForType('step_completed');
                    iconContainer.style.color = '#28a745';
                }
                actionEl.style.opacity = '0.7';
            }
        });

        console.log('Reconstructed task visualization with', planSteps.length, 'steps');
    }

    async function loadChatFiles(chatId) {
        try {
            // Get files for this chat from the backend
            const response = await fetch(`/api/chats/${chatId}/files`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                if (data.files &&
                    ((data.files.host && data.files.host.length > 0) ||
                        (data.files.container && data.files.container.length > 0))) {
                    const filesHtml = generateFilesHtml(data.files);
                    addMessage(`<div class="file-output">
                        <div class="file-header">
                            <i class="fas fa-file-alt"></i> Task Output Files
                        </div>
                        <div class="file-list">
                            ${filesHtml}
                        </div>
                    </div>`, 'system', 'html');
                }
            }
        } catch (error) {
            console.error('Error loading chat files:', error);
            // Don't show error to user, just log it
        }
    }

    async function createNewChat() {
        try {

            chatMessages.innerHTML = '';



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


            await loadUserChats();

            console.log('New chat created:', currentChatId);
            return data.chat;
        } catch (error) {
            console.error('Error creating new chat:', error);
            updateStatusDisplay('Failed to create new chat', 'error');
        }
    }


    if (sendButton && messageInput) {
        sendButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleSendMessage();
            }
        });
    }


    if (newTaskButton) {
        newTaskButton.addEventListener('click', () => {
            // Check if we're in the combined interface
            const chatInterface = document.getElementById('chat-interface');
            const welcomeScreen = document.getElementById('welcome-screen');

            if (chatInterface && welcomeScreen) {
                // We're in the combined interface, show welcome screen
                chatInterface.classList.remove('active');
                welcomeScreen.classList.remove('hidden');

                // Clear any stored data
                localStorage.removeItem('initialQuery');
                localStorage.setItem('currentChatId', 'new');

                // Clear active chat selection
                document.querySelectorAll('.recent-chat-item').forEach(item => {
                    item.classList.remove('active');
                });
            } else if (chatMessages) {
                // We're in the old chat interface
                chatMessages.innerHTML = '';
                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');

                document.querySelectorAll('.recent-chat-item').forEach(item => {
                    item.classList.remove('active');
                });

                if (messageInput) {
                    messageInput.focus();
                }
            } else {
                // Fallback to redirect
                window.location.href = 'index.html';
            }
        });
    }


    function updateStatusDisplay(text, statusType = 'info') {
        if (!statusDisplay) return;

        let iconHtml = '';
        statusDisplay.classList.remove('active');

        switch (statusType) {
            case 'loading':
            case 'status_update':
                iconHtml = getIconForType('status_update');
                statusDisplay.classList.add('active');
                break;
            case 'idle':
                iconHtml = '<i class="fas fa-check"></i>';
                break;
            case 'completed':
                iconHtml = getIconForType('task_completed');
                break;
            case 'error':
                iconHtml = getIconForType('task_error');
                break;
            default:
                iconHtml = '';
        }

        statusDisplay.innerHTML = `${iconHtml} <span>${text || '-'}</span>`;
    }


    function verifyMessageStructure(messageElement) {

        if (!messageElement.classList.contains('message')) {
            console.warn('Message element missing "message" class, adding it');
            messageElement.classList.add('message');
        }


        if (!messageElement.querySelector('.message-content')) {
            console.warn('Message element missing content div, restructuring');


            const content = messageElement.innerHTML;


            messageElement.innerHTML = '';


            const contentDiv = document.createElement('div');
            contentDiv.classList.add('message-content');
            contentDiv.innerHTML = content;


            messageElement.appendChild(contentDiv);
        }

        return messageElement;
    }


    function extractTextFromObject(messageObj) {
        if (typeof messageObj === 'string') {
            return messageObj;
        }

        if (typeof messageObj !== 'object' || messageObj === null) {
            return String(messageObj);
        }


        if (messageObj.text) {
            return messageObj.text;
        }


        if (messageObj.result) {
            return messageObj.result;
        }


        if (Array.isArray(messageObj) && messageObj.length > 0) {
            const textContent = messageObj
                .filter(item => item.type === 'text')
                .map(item => item.text)
                .join("\n");

            if (textContent) {
                return textContent;
            }
        }


        return JSON.stringify(messageObj, null, 2);
    }

    function isJsonResponse(text) {
        if (!text || typeof text !== 'string') return false;

        const trimmed = text.trim();

        // Check if it starts and ends with JSON brackets/braces
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                JSON.parse(trimmed);
                return true;
            } catch (e) {
                return false;
            }
        }

        return false;
    }

    function addMessage(text, sender, type = 'text') {

        if (!chatMessages) return;


        const messageText = extractTextFromObject(text);

        const messageElement = document.createElement('div');

        if (sender === 'system') {
            messageElement.classList.add('message', 'system');
            if (type === 'html') {

                messageElement.innerHTML = messageText;
            } else {

                messageElement.textContent = messageText;
            }
        } else {


            messageElement.classList.add('message', sender);


            const contentElement = document.createElement('div');
            contentElement.classList.add('message-content');

            if (sender === 'ai') {

                try {

                    marked.setOptions({
                        gfm: true,
                        breaks: true
                    });
                    contentElement.innerHTML = marked.parse(messageText);
                } catch (e) {
                    console.error("Fehler beim Parsen von Markdown:", e);
                    contentElement.textContent = messageText;
                }
            } else {
                contentElement.textContent = messageText;
            }

            messageElement.appendChild(contentElement);
        }


        verifyMessageStructure(messageElement);

        chatMessages.appendChild(messageElement);
        scrollToBottom();
    }

    function addActionElement(title, content, type = 'default', parentElement = chatMessages) {
        const actionElement = document.createElement('div');
        actionElement.classList.add('action-element', `action-${type}`);
        actionElement.dataset.actionType = type;

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
        contentElement.innerHTML = content;

        detailsElement.appendChild(titleElement);
        detailsElement.appendChild(contentElement);

        actionElement.appendChild(iconElement);
        actionElement.appendChild(detailsElement);

        parentElement.appendChild(actionElement);
        scrollToBottomIfNeeded(parentElement);

        return actionElement;
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

        return contentElement;
    }

    function getIconForType(type) {

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
                iconHtml = '<i class="fas fa-spinner fa-spin"></i>'; break;
            case 'step_completed':
                iconHtml = '<i class="fas fa-check-circle"></i>'; break;
            case 'task_completed':
                iconHtml = '<i class="fas fa-flag-checkered"></i>'; break;
            case 'task_error':
                iconHtml = '<i class="fas fa-exclamation-triangle"></i>'; break;
        }
        return iconHtml;
    }

    function scrollToBottom() {
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function scrollToBottomIfNeeded(parentElement) {

        if (parentElement === chatMessages && chatMessages) {
            scrollToBottom();
        }
    }

    // Add a global flag to track task status
    let taskInProgress = false;

    function handleSendMessage() {

        if (!messageInput || !chatMessages) return;

        const message = messageInput.value.trim();
        if (!message) return;

        // Prevent double submission
        if (taskInProgress) {
            console.log('Task already in progress, preventing double submission');
            updateStatusDisplay('A task is already running', 'info');
            return;
        }

        // Set flag to prevent multiple submissions
        taskInProgress = true;

        const processSendMessage = (chatId) => {

            addMessage(message, 'user');
            messageInput.value = '';

            updateStatusDisplay('Task received', 'loading');
            
            socket.emit('submit_task', { 
                task: message,
                userId: userId,
                chatId: chatId
            });

            if (messageInput && sendButton) {
                messageInput.disabled = true;
                sendButton.disabled = true;
            }
        };


        if (!currentChatId || currentChatId === 'new') {
            createNewChat().then((newChat) => {
                if (newChat && newChat.id) {
                    currentChatId = newChat.id;
                    localStorage.setItem('currentChatId', currentChatId);
                    processSendMessage(currentChatId);
                    updateChatTitleFromContent(currentChatId, message);
                } else {
                    console.error('Failed to create new chat');
                    updateStatusDisplay('Failed to create new chat', 'error');
                    if (messageInput && sendButton) {
                        messageInput.disabled = false;
                        sendButton.disabled = false;
                    }
                }
            }).catch((error) => {
                console.error('Error creating new chat:', error);
                updateStatusDisplay('Failed to create new chat', 'error');
                if (messageInput && sendButton) {
                    messageInput.disabled = false;
                    sendButton.disabled = false;
                }
            });
        } else {

            processSendMessage(currentChatId);


            if (document.querySelectorAll('.message.user-message').length === 1) {
                updateChatTitleFromContent(currentChatId, message);
            }
        }
    }


    function isDuplicateMessage(messageText, maxMessagesToCheck = 5) {
        if (!chatMessages) return false;

        const messages = chatMessages.querySelectorAll('.message.ai');
        if (messages.length === 0) return false;

        const cleanMessageText = messageText.trim();
        if (!cleanMessageText) return false;


        const messagesToCheck = Math.min(messages.length, maxMessagesToCheck);
        for (let i = messages.length - 1; i >= messages.length - messagesToCheck; i--) {
            const msgContent = messages[i].querySelector('.message-content');
            if (msgContent) {
                const existingText = msgContent.textContent.trim();

                // Check for exact match
                if (existingText === cleanMessageText) {
                    console.log('Preventing exact duplicate message:', cleanMessageText.substring(0, 50) + '...');
                    return true;
                }

                // Check for substantial similarity (90% match for longer messages)
                if (cleanMessageText.length > 50 && existingText.length > 50) {
                    const similarity = calculateSimilarity(existingText, cleanMessageText);
                    if (similarity > 0.9) {
                        console.log('Preventing similar duplicate message (similarity:', similarity, '):', cleanMessageText.substring(0, 50) + '...');
                        return true;
                    }
                }
            }
        }

        return false;
    }

    function calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) return 1.0;

        const editDistance = levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    function levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }


    socket.on('ai_message', (data) => {
        try {
            // Skip if we're currently loading history
            if (window.isLoadingHistory) {
                console.log('Skipping ai_message during history loading');
                return;
            }


            if (data.chatId && data.chatId !== currentChatId) return;


            const messageText = extractTextFromObject(data.text);


            if (!messageText || messageText.trim() === '') {
                console.log('Ignoring empty message');
                return;
            }

            // Skip JSON responses and processing messages
            if (isJsonResponse(messageText) ||
                messageText.includes('Processing your task')) {
                console.log('Skipping JSON or processing message');
                return;
            }


            if (isDuplicateMessage(messageText)) return;



            const welcomeText = "Hello! I'm your Operon.one assistant. How can I help you today?";
            if (messageText.includes(welcomeText) && document.querySelector('.message.ai .message-content')?.textContent.includes(welcomeText)) {
                console.log('Skipping welcome message in new chat');
                return;
            }


            addMessage(messageText, 'ai');
        } catch (error) {
            console.error('Error processing AI message:', error);
            updateStatusDisplay('Error processing message', 'error');
        }
    });


    function updateChatTitleFromContent(chatId, messageText) {

        if (!chatId || chatId === 'new') return;



        let title = messageText;


        if (title.length > 40) {
            title = title.substring(0, 37) + '...';
        }


        const chatListItem = document.querySelector(`.recent-chat-item[data-chat-id="${chatId}"]`);
        if (chatListItem) {
            const chatTitle = chatListItem.querySelector('.chat-title');
            if (chatTitle) {
                chatTitle.textContent = title;
            }
        }


        updateChatTitle(chatId, title);
    }


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


    socket.on('status_update', (data) => {

        if (data.userId === userId) {
            console.log('Status update:', data);
            updateStatusDisplay(data.status || 'Processing...', 'status_update');
        }
    });


    let stepGroups = {};

    socket.on('steps', (data) => {
        // Skip if we're currently loading history (steps will be reconstructed from database)
        if (window.isLoadingHistory && !data.loadedFromHistory) {
            console.log('Skipping steps event during history loading');
            return;
        }

        // Skip if we already have steps for this task
        const existingStepGroup = chatMessages.querySelector('.step-group');
        if (existingStepGroup && !data.loadedFromHistory) {
            console.log('Steps already exist, skipping duplicate steps event');
            return;
        }

        if (data.plan && Array.isArray(data.plan)) {
            const statusText = data.loadedFromHistory ? 'Plan loaded from history' : 'Plan received';
            updateStatusDisplay(statusText, 'info');
            stepGroups = {};
            const planGroupContent = addStepGroup(`Plan (${data.plan.length} Steps)`, false);
            data.plan.forEach((step, index) => {
                const stepId = `step-${index}`;

                const actionEl = addActionElement(
                    `Step ${index + 1}: ${step.step || 'Unnamed Step'}`,
                    `Action: ${step.action || 'N/A'}<br>Expected: ${step.expectedOutput || 'N/A'}`,
                    'plan-step',
                    planGroupContent
                );
                actionEl.dataset.stepId = stepId;
            });
        }
    });


    socket.on('step_completed', (data) => {
        // Skip if we're currently loading history (step completions will be reconstructed from database)
        if (window.isLoadingHistory) {
            console.log('Skipping step_completed event during history loading');
            return;
        }

        if (data.userId === userId) {
            console.log('Step completed:', data);
            updateStatusDisplay(`Step ${data.metrics.stepIndex + 1}/${data.metrics.totalSteps} completed: ${data.step}`, 'status_update');
            const stepId = `step-${data.metrics.stepIndex}`;
            const stepElement = chatMessages.querySelector(`.action-element[data-step-id="${stepId}"]`);
            if (stepElement) {
                const iconContainer = stepElement.querySelector('.action-icon');
                if (iconContainer) {
                    iconContainer.innerHTML = getIconForType('step_completed');
                    iconContainer.style.color = '#28a745';
                }
                stepElement.style.opacity = '0.7';
            }
        }
    });


    socket.on('task_completed', (data) => {
        try {
            if (data.userId === userId) {
                console.log('Task completed:', data);

                // Reset task in progress flag
                taskInProgress = false;

                const result = extractTextFromObject(data.result) || 'Task completed successfully';

                // Only add the message if it's not a duplicate and not from history loading
                if (!isDuplicateMessage(result) && !data.loadedFromHistory && !window.isLoadingHistory) {
                    addMessage(result, 'ai');
                }

                // Only add file output if we have files and haven't already shown them
                if (data.outputFiles &&
                    ((data.outputFiles.host && data.outputFiles.host.length > 0) ||
                        (data.outputFiles.container && data.outputFiles.container.length > 0)) &&
                    !document.querySelector('.file-output')) {
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

                const statusText = data.loadedFromHistory ? 'History loaded' : 'Task completed';
                updateStatusDisplay(statusText, 'completed');
                
                messageInput.disabled = false;
                sendButton.disabled = false;
            }
        } catch (error) {
            console.error('Error processing task completion:', error.message);
            updateStatusDisplay('Error completing task', 'error');
            
            // Reset task in progress flag even on error
            taskInProgress = false;
            
            // Re-enable input controls
            if (messageInput && sendButton) {
                messageInput.disabled = false;
                sendButton.disabled = false;
            }
        }
    });


    function generateFilesHtml(files) {
        if (!files || (!files.host || files.host.length === 0) && (!files.container || files.container.length === 0)) {
            return '<p>No files generated.</p>';
        }

        let html = '<div class="file-output-container">';

        const generateList = (title, fileList) => {
            if (!fileList || fileList.length === 0) return '';

            let listHtml = `<h3>${title}</h3><ul>`;
            fileList.forEach(file => {
                const fileName = file.fileName || (file.path ? file.path.split('/').pop() : `file_${file.id}`);
                const fileExtension = file.extension || fileName.split('.').pop() || '';
                const isTextBased = ['txt', 'log', 'csv', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'c', 'cpp', 'md'].includes(fileExtension.toLowerCase());

                const safeFileName = fileName.replace(/'/g, "\\'").replace(/"/g, "&quot;");

                listHtml += `
                    <li>
                        <span class="file-name">${fileName}</span>
                        <span class="file-path">(${file.path || 'N/A'})</span>
                        <div class="file-actions">
                            <button class="file-action-btn download-btn" onclick="window.downloadFile(${file.id}, '${safeFileName}')">Download</button>
                            ${isTextBased ? `<button class="file-action-btn view-btn" onclick="window.viewFileContent(${file.id}, '${safeFileName}')">View</button>` : ''}
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


    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    socket.on('task_error', (data) => {
        console.log('Task error received:', data);
        
        // Only reset if this is for the current user and chat
        if (!data.userId || data.userId === userId) {
            // Reset UI state
            if (messageInput && sendButton) {
                messageInput.disabled = false;
                sendButton.disabled = false;
            }
            
            // Reset the task in progress flag
            taskInProgress = false;
            
            // Show error message to user
            updateStatusDisplay(data.error || 'Error processing task', 'error');
        }
    });


    socket.on('task_received', (data) => {

        if (data.userId === userId) {
            console.log('Task received:', data);
            updateStatusDisplay('Task received', 'status_update');
        }
    });








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


            if (chatId == currentChatId) {

                if (chatMessages) {
                    chatMessages.innerHTML = '';
                }


                currentChatId = 'new';
                localStorage.setItem('currentChatId', 'new');
            }


            await loadUserChats();


            if (statusDisplay) {
                updateStatusDisplay('Chat deleted successfully', 'success');

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


    document.addEventListener('downloadFileRequest', (e) => {
        const { fileId, fileName } = e.detail;
        const token = authToken;
        handleFileDownload(fileId, fileName, token);
    });

    document.addEventListener('viewFileRequest', (e) => {
        const { fileId, fileName } = e.detail;
        const token = authToken;
        handleFileView(fileId, fileName, token);
    });


    async function handleFileDownload(fileId, fileName, token) {
        try {
            const response = await fetch(`/api/files/${fileId}/download`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {

                let errorMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || errorMsg;
                } catch (e) {

                }
                throw new Error(errorMsg);
            }


            const blob = await response.blob();


            const url = window.URL.createObjectURL(blob);


            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;

            a.download = fileName;


            document.body.appendChild(a);
            a.click();


            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);

        } catch (error) {
            console.error('Error downloading file:', error);

            showModal(`<p class="error-message">Error downloading file: ${error.message}</p>`, 'Download Error');
        }
    }


    async function handleFileView(fileId, fileName, token) {

        showModal('Loading file content...', `Loading: ${fileName}`);

        try {
            const response = await fetch(`/api/files/${fileId}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to load file content' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }


            const contentType = response.headers.get('Content-Type');
            const isBinary = contentType && (
                contentType.indexOf('text/') !== 0 &&
                contentType !== 'application/json' &&
                contentType !== 'application/javascript'
            );

            const fileExtension = fileName.split('.').pop().toLowerCase();
            const binaryExtensions = ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'exe', 'jpg', 'jpeg', 'png', 'gif'];

            if (isBinary || binaryExtensions.includes(fileExtension)) {

                showModal(`<p>Binary file detected. This file type cannot be previewed in the browser.</p>
                          <button class="btn" onclick="window.downloadFile('${fileId}', '${fileName}')">Download instead</button>`,
                    `Cannot Preview: ${fileName}`);
            } else {

                const fileContent = await response.text();


                const contentHtml = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(fileContent)}</pre>`;
                showModal(contentHtml, `Preview: ${fileName}`);
            }

        } catch (error) {
            console.error('Error viewing file content:', error);
            showModal(`<p class="error-message">Error loading file: ${error.message}</p>`, 'Error');
        }
    }


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
        modalBody.innerHTML = content;
        modal.style.display = 'flex';


        modalClose.onclick = () => {
            modal.style.display = 'none';
        };

        modal.onclick = (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    /**
     * Retrieves the MCP servers configured for the current user
     * @returns {Promise<Object>} Object containing MCP server configurations
     */
    async function getMcpServers() {
        const authToken = localStorage.getItem('authToken');
        if (!authToken) {
            throw new Error('Authentication required');
        }

        try {
            const response = await fetch('/api/settings/mcpServers', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to retrieve MCP servers');
            }

            const data = await response.json();
            return data.mcpServers ? JSON.parse(data.mcpServers) : {};
        } catch (error) {
            console.error('Error retrieving MCP servers:', error);
            return {};
        }
    }

    /**
     * Gets details for a specific MCP server by name
     * @param {string} serverName - Name of the server to retrieve
     * @returns {Promise<Object|null>} Server configuration or null if not found
     */
    async function getMcpServerByName(serverName) {
        const servers = await getMcpServers();
        return servers[serverName] || null;
    }

    // Make functions available in the global scope
    window.getMcpServers = getMcpServers;
    window.getMcpServerByName = getMcpServerByName;
}); 