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

        // Handle sidebar toggle with improved touch support
        const handleToggle = (event) => {
            event.preventDefault();
            event.stopPropagation();
            sidebar.classList.toggle('expanded');
            toggleButton.innerHTML = sidebar.classList.contains('expanded') ?
                '<i class="fas fa-times"></i>' :
                '<i class="fas fa-bars"></i>';
        };

        toggleButton.addEventListener('click', handleToggle);
        toggleButton.addEventListener('touchend', handleToggle);

        // Close sidebar when clicking outside or on overlay
        document.addEventListener('click', (event) => {
            const isClickInside = sidebar.contains(event.target);
            const isToggleButton = toggleButton.contains(event.target);
            
            if (!isClickInside && !isToggleButton && window.innerWidth <= 768 && sidebar.classList.contains('expanded')) {
                sidebar.classList.remove('expanded');
                toggleButton.innerHTML = '<i class="fas fa-bars"></i>';
            }
        });

        // Prevent sidebar from closing when clicking inside the sidebar content
        sidebar.addEventListener('click', (event) => {
            if (sidebar.classList.contains('expanded')) {
                event.stopPropagation();
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

        // Check for running tasks to restore streaming
        if (currentChatId && currentChatId !== 'new') {
            socket.emit('check_running_task', { chatId: currentChatId });
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
    
    // Credits management functions
    async function loadCredits() {
        try {
            const response = await fetch('/api/credits', {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const creditsElement = document.getElementById('credits-count');
                if (creditsElement) {
                    creditsElement.textContent = data.credits.toLocaleString();
                }
            }
        } catch (error) {
            console.error('Error loading credits:', error);
        }
    }
    
    // Load credits on page load
    loadCredits();
    
    // Refresh credits every 10 seconds for more responsive updates
    setInterval(loadCredits, 10000);
    
    // Global functions for redeem modal
    window.showRedeemModal = function() {
        const modal = document.getElementById('redeem-modal');
        const input = document.getElementById('redeem-code-input');
        const message = document.getElementById('redeem-message');
        
        modal.style.display = 'flex';
        input.value = '';
        input.focus();
        message.style.display = 'none';
        message.className = 'redeem-message';
    };
    
    window.hideRedeemModal = function() {
        const modal = document.getElementById('redeem-modal');
        modal.style.display = 'none';
    };
    
    window.redeemCode = async function() {
        const input = document.getElementById('redeem-code-input');
        const message = document.getElementById('redeem-message');
        const submitBtn = document.getElementById('redeem-submit-btn');
        
        const code = input.value.trim();
        if (!code) {
            showRedeemMessage('Please enter a code', 'error');
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Redeeming...';
        
        try {
            const response = await fetch('/api/redeem-code', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code: code })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showRedeemMessage(data.message, 'success');
                loadCredits(); // Refresh credits display
                setTimeout(() => {
                    hideRedeemModal();
                }, 2000);
            } else {
                showRedeemMessage(data.error || 'Failed to redeem code', 'error');
            }
        } catch (error) {
            console.error('Error redeeming code:', error);
            showRedeemMessage('Network error. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Redeem';
        }
    };
    
    function showRedeemMessage(text, type) {
        const message = document.getElementById('redeem-message');
        message.textContent = text;
        message.className = `redeem-message ${type}`;
        message.style.display = 'block';
    }
    
    // Handle Enter key in redeem input
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const modal = document.getElementById('redeem-modal');
            if (modal && modal.style.display === 'flex') {
                redeemCode();
            }
        }
        if (event.key === 'Escape') {
            const modal = document.getElementById('redeem-modal');
            if (modal && modal.style.display === 'flex') {
                hideRedeemModal();
            }
        }
    });

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
        if (!chatId || chatId === 'new') {
            chatMessages.innerHTML = '';
            return;
        }

        window.isLoadingHistory = true;
        taskStepsRestored = false;

        try {
            const response = await fetch(`/api/chats/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load chat history: ${response.status}`);
            }

            const data = await response.json();
            chatMessages.innerHTML = '';

            if (data.messages && data.messages.length > 0) {
                data.messages.forEach((message, index) => {
                    const isLastMessage = index === data.messages.length - 1;
                    
                    if (message.role === 'user') {
                        addMessage(message.content, 'user');
                    } else if (message.role === 'assistant') {
                        const content = extractTextFromObject(message.content);
                        if (content && !isJsonResponse(content)) {
                            addMessage(content, 'ai');
                        }
                    }
                });

                if (data.taskSteps && data.taskSteps.length > 0) {
                    reconstructTaskVisualization(data.taskSteps);
                }

                await loadChatFiles(chatId);
            }

            // Check for running tasks after loading history
            socket.emit('check_running_task', { chatId: chatId });

        } catch (error) {
            console.error('Error loading chat history:', error);
            chatMessages.innerHTML = '<div class="error-message">Failed to load chat history</div>';
        } finally {
            window.isLoadingHistory = false;
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
        taskStepsRestored = true;
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

        const statusContent = statusDisplay.querySelector('.status-content');
        if (statusContent) {
            statusContent.innerHTML = `${iconHtml} ${text || '-'}`;
        } else {
            // Fallback for old structure
            statusDisplay.innerHTML = `${iconHtml} <span>${text || '-'}</span>`;
        }
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
    let taskStepsRestored = false;

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
        taskStepsRestored = false;

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

    function isDuplicateUserMessage(messageText, maxMessagesToCheck = 5) {
        if (!chatMessages) return false;

        const messages = chatMessages.querySelectorAll('.message.user');
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
                    console.log('Preventing exact duplicate user message:', cleanMessageText.substring(0, 50) + '...');
                    return true;
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
            
            // If this is a status update from a restored running task, adjust the display
            if (data.restoredFromRunning) {
                updateStatusDisplay(data.status || 'Processing...', 'status_update');
            } else {
                updateStatusDisplay(data.status || 'Processing...', 'status_update');
            }
        }
    });


    let stepGroups = {};

    socket.on('steps', (data) => {
        // Skip if we're currently loading history (steps will be reconstructed from database)
        if (window.isLoadingHistory && !data.loadedFromHistory && !data.restoredFromRunning) {
            console.log('Skipping steps event during history loading');
            return;
        }

        // Skip if we already have steps for this task (including restored tasks)
        const existingStepGroup = chatMessages.querySelector('.step-group');
        if ((existingStepGroup || taskStepsRestored) && !data.loadedFromHistory) {
            console.log('Steps already exist, skipping duplicate steps event. restoredFromRunning:', data.restoredFromRunning, 'taskStepsRestored:', taskStepsRestored);
            return;
        }

        if (data.plan && Array.isArray(data.plan)) {
            let statusText;
            if (data.restoredFromRunning) {
                statusText = 'Task restored - continuing execution';
            } else if (data.loadedFromHistory) {
                statusText = 'Plan loaded from history';
            } else {
                statusText = 'Plan received';
            }
            
            updateStatusDisplay(statusText, 'info');
            stepGroups = {};
            const planGroupContent = addStepGroup(`Plan (${data.plan.length} Steps)`, false);
            
            // Add email notification checkbox if task has more than 2 steps
            if (data.plan.length > 2 && !data.loadedFromHistory && !data.restoredFromRunning) {
                const emailNotificationContainer = document.createElement('div');
                emailNotificationContainer.className = 'email-notification-container';
                emailNotificationContainer.style.cssText = `
                    margin: 10px 0;
                    padding: 10px;
                    background: rgba(99, 102, 241, 0.1);
                    border-radius: 8px;
                    border-left: 4px solid var(--primary);
                `;
                
                const checkboxWrapper = document.createElement('label');
                checkboxWrapper.style.cssText = `
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    color: var(--light);
                    font-size: 0.9rem;
                `;
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `email-notification-${data.chatId}`;
                checkbox.style.cssText = `
                    accent-color: var(--primary);
                    transform: scale(1.1);
                `;
                
                const label = document.createElement('span');
                label.textContent = 'Email me when this task completes';
                label.style.cssText = 'user-select: none;';
                
                checkboxWrapper.appendChild(checkbox);
                checkboxWrapper.appendChild(label);
                emailNotificationContainer.appendChild(checkboxWrapper);
                
                // Handle checkbox change
                checkbox.addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    console.log('Email notification preference:', isChecked);
                    
                    // Store preference via socket
                    socket.emit('update_email_notification_preference', {
                        chatId: data.chatId,
                        enabled: isChecked
                    });
                });
                
                planGroupContent.appendChild(emailNotificationContainer);
            }
            
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
        if (window.isLoadingHistory && !data.restoredFromRunning) {
            console.log('Skipping step_completed event during history loading');
            return;
        }

        if (data.userId === userId) {
            console.log('Step completed:', data);
            
            const stepId = `step-${data.metrics.stepIndex}`;
            const stepElement = chatMessages.querySelector(`.action-element[data-step-id="${stepId}"]`);
            
            // Skip if step is already marked as completed
            if (stepElement && stepElement.style.opacity === '0.7') {
                console.log('Step already marked as completed, skipping duplicate');
                return;
            }
            
            const statusText = data.restoredFromRunning ? 
                `Restored: Step ${data.metrics.stepIndex + 1}/${data.metrics.totalSteps} completed: ${data.step}` :
                `Step ${data.metrics.stepIndex + 1}/${data.metrics.totalSteps} completed: ${data.step}`;
                
            updateStatusDisplay(statusText, 'status_update');
            
            // Refresh credits when AI steps complete (not for restored steps)
            if (!data.restoredFromRunning && data.step.includes('ai')) {
                loadCredits();
            }
            
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
                
                // Refresh credits after task completion
                if (!data.loadedFromHistory) {
                    loadCredits();
                }
                
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

    socket.on('task_status_checked', (data) => {
        if (data.userId === userId && data.isRunning) {
            console.log('Restoring running task:', data);
            
            // Set task in progress state
            taskInProgress = true;
            
            // Disable input controls
            if (messageInput && sendButton) {
                messageInput.disabled = true;
                sendButton.disabled = true;
            }
            
            // Show restoration status
            updateStatusDisplay('Restoring running task...', 'status_update');
            
            // Add the original user message if we have the question
            if (data.question && !isDuplicateUserMessage(data.question)) {
                addMessage(data.question, 'user');
            }
        } else if (data.userId === userId && !data.isRunning) {
            // No running task, keep UI in normal state
            console.log('No running task found');
        } else if (data.error) {
            console.error('Error checking task status:', data.error);
        }
    });

    socket.on('email_notification_preference_updated', (data) => {
        if (data.success) {
            console.log('Email notification preference saved successfully');
        } else {
            console.error('Failed to save email notification preference:', data.error);
            updateStatusDisplay('Failed to save email notification preference', 'error');
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

    // Tool Sidebar Management
    const toolSidebar = document.getElementById('tool-sidebar');
    const toolSidebarToggle = document.getElementById('tool-sidebar-toggle');
    const toolSidebarContent = document.getElementById('tool-sidebar-content');
    const toolsToggleBtn = document.getElementById('tools-toggle-btn');
    let activeSidebarTools = new Map();

    // Initialize tool sidebar toggle
    if (toolSidebarToggle) {
        toolSidebarToggle.addEventListener('click', () => {
            if (toolSidebar) {
                toolSidebar.classList.toggle('active');
                const isActive = toolSidebar.classList.contains('active');
                toolSidebarToggle.innerHTML = `<i class="fas fa-${isActive ? 'times' : 'tools'}"></i>`;
                updateToggleButtons(isActive);
            }
        });
    }

    // Initialize main tools toggle button
    if (toolsToggleBtn) {
        toolsToggleBtn.addEventListener('click', () => {
            if (toolSidebar) {
                toolSidebar.classList.toggle('active');
                const isActive = toolSidebar.classList.contains('active');
                updateToggleButtons(isActive);
            }
        });
    }

    function updateToggleButtons(isActive) {
        if (toolsToggleBtn) {
            toolsToggleBtn.classList.toggle('active', isActive);
            toolsToggleBtn.title = isActive ? 'Hide Tools' : 'Show Tools';
        }
        if (toolSidebarToggle) {
            toolSidebarToggle.innerHTML = `<i class="fas fa-${isActive ? 'times' : 'tools'}"></i>`;
        }
    }

    // Socket event handlers for sidebar updates
    socket.on('sidebar_update', (data) => {
        const { toolName, data: toolData } = data;
        updateToolSidebar(toolName, toolData);
    });

    function updateToolSidebar(toolName, data) {
        if (!toolSidebarContent) return;

        // Clear all other tools and only show the current one
        activeSidebarTools.clear();
        
        if (data) {
            activeSidebarTools.set(toolName, data);
            renderToolSidebar();

            // Auto-open sidebar when tool is active
            if (!toolSidebar.classList.contains('active')) {
                toolSidebar.classList.add('active');
                updateToggleButtons(true);
            }
        } else {
            // If no data, hide the sidebar
            renderToolSidebar();
            if (activeSidebarTools.size === 0) {
                toolSidebar.classList.remove('active');
                updateToggleButtons(false);
            }
        }
    }

    function renderToolSidebar() {
        if (!toolSidebarContent) return;

        // Clear existing content
        toolSidebarContent.innerHTML = '';

        if (activeSidebarTools.size === 0) {
            toolSidebarContent.innerHTML = `
                <div class="tool-sidebar-empty">
                    <i class="fas fa-tools"></i>
                    <p>No active tools</p>
                </div>
            `;
            return;
        }

        // Render each tool
        activeSidebarTools.forEach((data, toolName) => {
            if (!data) return;

            const toolPanel = createToolPanel(toolName, data);
            toolSidebarContent.appendChild(toolPanel);
        });
    }

    function createToolPanel(toolName, data) {
        const panel = document.createElement('div');
        panel.className = 'tool-panel';
        panel.id = `tool-panel-${toolName}`;

        const iconMap = {
            filesystem: 'fas fa-file-alt',
            browser: 'fas fa-globe',
            deepSearch: 'fas fa-search',
            pythonExecute: 'fab fa-python',
            default: 'fas fa-cog'
        };

        const icon = iconMap[toolName] || iconMap.default;

        panel.innerHTML = `
            <div class="tool-panel-header">
                <i class="${icon}"></i>
                <span class="tool-name">${toolName}</span>
            </div>
            <div class="tool-panel-body">
                ${renderToolData(toolName, data)}
            </div>
        `;

        return panel;
    }

    function renderToolData(toolName, data) {
        switch (toolName) {
            case 'filesystem':
                return renderFilesystemData(data);
            case 'browser':
                return renderBrowserData(data);
            case 'deepSearch':
                return renderDeepSearchData(data);
            case 'pythonExecute':
                return renderPythonExecuteData(data);
            default:
                return renderGenericData(data);
        }
    }

    function renderFilesystemData(data) {
        let html = '';

        if (data.currentFile) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Current File</div>
                    <div class="tool-info-value">${escapeHtml(data.currentFile)}</div>
                </div>
            `;
        }

        if (data.workingDirectory) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Working Directory</div>
                    <div class="tool-info-value">${escapeHtml(data.workingDirectory)}</div>
                </div>
            `;
        }

        if (data.recentFiles && data.recentFiles.length > 0) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Recent Files</div>
                    <div class="tool-info-value">
                        ${data.recentFiles.slice(0, 5).map(file => 
                            `<div style="padding: 2px 0;">${escapeHtml(file)}</div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }

        return html || '<div class="tool-info-item">No file information available</div>';
    }

    function renderBrowserData(data) {
        let html = '';

        if (data.screenshot) {
            html += `
                <div class="browser-preview">
                    ${data.currentUrl ? `<div class="browser-url">${escapeHtml(data.currentUrl)}</div>` : ''}
                    <img src="data:image/png;base64,${data.screenshot}" alt="Browser Screenshot" />
                </div>
            `;
        }

        if (data.currentUrl && !data.screenshot) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Current URL</div>
                    <div class="tool-info-value">${escapeHtml(data.currentUrl)}</div>
                </div>
            `;
        }

        if (data.pageTitle) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Page Title</div>
                    <div class="tool-info-value">${escapeHtml(data.pageTitle)}</div>
                </div>
            `;
        }

        return html || '<div class="tool-info-item">No browser information available</div>';
    }

    function renderDeepSearchData(data) {
        let html = '';

        if (data.currentTask) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Current Task</div>
                    <div class="tool-info-value">${escapeHtml(data.currentTask)}</div>
                </div>
            `;
        }

        if (data.status) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Status</div>
                    <div class="tool-info-value">${escapeHtml(data.status)}</div>
                </div>
            `;
        }

        if (data.queriesGenerated) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Queries Generated</div>
                    <div class="tool-info-value">${data.queriesGenerated}</div>
                </div>
            `;
        }

        if (data.queries && data.queries.length > 0) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Search Queries</div>
                    <div class="tool-info-value">
                        ${data.queries.map(query => 
                            `<div style="padding: 2px 0;">• ${escapeHtml(query)}</div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }

        if (data.resultsFound !== undefined) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Results Found</div>
                    <div class="tool-info-value">${data.resultsFound}</div>
                </div>
            `;
        }

        if (data.reportSummary) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Report Summary</div>
                    <div class="tool-info-value">${escapeHtml(data.reportSummary)}</div>
                </div>
            `;
        }

        return html || '<div class="tool-info-item">No search information available</div>';
    }

    function renderPythonExecuteData(data) {
        let html = '';

        if (data.currentTask) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Current Task</div>
                    <div class="tool-info-value">${escapeHtml(data.currentTask)}</div>
                </div>
            `;
        }

        if (data.status) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Status</div>
                    <div class="tool-info-value">${escapeHtml(data.status)}</div>
                </div>
            `;
        }

        if (data.stage) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Stage</div>
                    <div class="tool-info-value">${escapeHtml(data.stage)}</div>
                </div>
            `;
        }

        if (data.codePreview) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Code Preview</div>
                    <div class="tool-info-value" style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(data.codePreview)}</div>
                </div>
            `;
        }

        if (data.dependencies && data.dependencies.length > 0) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Dependencies</div>
                    <div class="tool-info-value">
                        ${data.dependencies.map(dep => 
                            `<div style="padding: 2px 0;">• ${escapeHtml(dep)}</div>`
                        ).join('')}
                    </div>
                </div>
            `;
        }

        if (data.outputPreview) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Output Preview</div>
                    <div class="tool-info-value" style="font-family: monospace; white-space: pre-wrap;">${escapeHtml(data.outputPreview)}</div>
                </div>
            `;
        }

        if (data.error) {
            html += `
                <div class="tool-info-item">
                    <div class="tool-info-label">Error</div>
                    <div class="tool-info-value" style="color: #ef4444;">${escapeHtml(data.error)}</div>
                </div>
            `;
        }

        return html || '<div class="tool-info-item">No Python execution information available</div>';
    }

    function renderGenericData(data) {
        let html = '';

        if (typeof data === 'object') {
            Object.entries(data).forEach(([key, value]) => {
                html += `
                    <div class="tool-info-item">
                        <div class="tool-info-label">${escapeHtml(key)}</div>
                        <div class="tool-info-value">${escapeHtml(String(value))}</div>
                    </div>
                `;
            });
        } else {
            html = `<div class="tool-info-item">${escapeHtml(String(data))}</div>`;
        }

        return html || '<div class="tool-info-item">No information available</div>';
    }



    // Remove tools that haven't been updated in a while
    setInterval(() => {
        const now = Date.now();
        activeSidebarTools.forEach((data, toolName) => {
            if (data && data.timestamp && (now - data.timestamp) > 300000) { // 5 minutes
                activeSidebarTools.delete(toolName);
                renderToolSidebar();
            }
        });
    }, 60000); // Check every minute

    // Make functions available in the global scope
    window.getMcpServers = getMcpServers;
    window.getMcpServerByName = getMcpServerByName;
    window.updateToolSidebar = updateToolSidebar;
}); 