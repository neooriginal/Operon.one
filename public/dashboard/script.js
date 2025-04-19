document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const statusDisplay = document.getElementById('status-display'); // Referenz zum Statusbereich

    // Get user authentication information
    const userId = localStorage.getItem('userId');
    const userEmail = localStorage.getItem('userEmail');
    const authToken = localStorage.getItem('authToken');

    // Redirect to login if not authenticated
    if (!userId || !authToken) {
        window.location.href = 'login.html';
        return;
    }

    // --- Socket.IO Verbindung herstellen ---
    // Stelle sicher, dass die URL zu deinem Server passt (wo socket.js läuft)
    const socket = io('http://localhost:3000', {
         transports: ['websocket'], // Bevorzuge WebSocket für bessere Performance
         auth: {
             token: authToken,
             userId: userId
         }
     });

    socket.on('connect', () => {
        console.log('Connected to Socket.IO Server! ID:', socket.id);
        updateStatusDisplay('Ready', 'idle'); // Initial status
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateStatusDisplay('Connection lost', 'error');
    });

    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        updateStatusDisplay(`Connection Error`, 'error');
    });

    // --- Hilfsfunktion zum Aktualisieren des Statusbereichs ---
    function updateStatusDisplay(text, statusType = 'info') {
        if (!statusDisplay) return;

        let iconHtml = '';
        statusDisplay.classList.remove('active'); // Reset active class

        switch (statusType) {
            case 'loading':
            case 'status_update':
                iconHtml = getIconForType('status_update'); // Spinner
                statusDisplay.classList.add('active'); // Highlight background when active
                break;
            case 'idle':
                iconHtml = '<i class="fas fa-check"></i>'; // Einfaches Häkchen für Bereit
                break;
             case 'completed':
                 iconHtml = getIconForType('task_completed');
                 break;
            case 'error':
                iconHtml = getIconForType('task_error');
                break;
            default:
                 iconHtml = ''; // Kein Icon für einfache Info
        }

        statusDisplay.innerHTML = `${iconHtml} <span>${text || '-'}</span>`;
    }

    // --- Nachrichten und Aktionen hinzufügen (Allgemeine Funktionen) ---
    function addMessage(text, sender, type = 'text') {
        const messageElement = document.createElement('div');
        if (type === 'system') {
            messageElement.classList.add('message', 'system');
            messageElement.textContent = text;
        } else {
            messageElement.classList.add('message', sender);
            if (sender === 'ai') {
                // Parse Markdown für AI-Nachrichten
                try {
                     // Setze Optionen für Marked (optional, z.B. für GitHub Flavored Markdown)
                     marked.setOptions({
                         gfm: true,
                         breaks: true // Konvertiert Zeilenumbrüche in <br>
                     });
                     messageElement.innerHTML = marked.parse(text);
                 } catch (e) {
                     console.error("Fehler beim Parsen von Markdown:", e);
                     messageElement.textContent = text; // Fallback auf reinen Text
                 }
            } else {
                messageElement.textContent = text; // Benutzernachrichten bleiben Text
            }
        }
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
        const groupElement = document.createElement('div');
        groupElement.classList.add('step-group');
        if (initiallyCollapsed) {
            groupElement.classList.add('collapsed');
        }

        const headerElement = document.createElement('div');
        headerElement.classList.add('step-group-header');
        headerElement.innerHTML = `
            <span>${title}</span>
            <i class="fas fa-chevron-down"></i>
        `;

        const contentElement = document.createElement('div');
        contentElement.classList.add('step-group-content');

        headerElement.addEventListener('click', () => {
            groupElement.classList.toggle('collapsed');
        });

        groupElement.appendChild(headerElement);
        groupElement.appendChild(contentElement);

        parentElement.appendChild(groupElement);
        scrollToBottomIfNeeded(parentElement);

        return contentElement; // Content-Container zurückgeben
    }

    function addFileDisplayElement(fileName, filePath, parentElement = chatMessages) {
        // Ensure fileName is a string before proceeding
        const displayFileName = (typeof fileName === 'string') ? fileName : 'Unnamed File';
        const safeFilePath = (typeof filePath === 'string') ? filePath : ''; // Use empty string if path is invalid

        const fileElement = document.createElement('div');
        fileElement.classList.add('file-display-element');

        const fileInfo = document.createElement('div');
        fileInfo.classList.add('file-info');
        fileInfo.innerHTML = `
            <i class="fas fa-file"></i>
            <span>${displayFileName}</span>
        `;

        const downloadButton = document.createElement('a');
        downloadButton.classList.add('download-button');
        // Only add href if filePath is valid
        if (safeFilePath) {
            downloadButton.href = `/download?userId=${socket.id}&filePath=${encodeURIComponent(safeFilePath)}`;
        } else {
            downloadButton.style.pointerEvents = 'none'; // Disable click if path is invalid
            downloadButton.style.opacity = '0.5';
        }
        downloadButton.target = '_blank';
        downloadButton.innerHTML = `
            <i class="fas fa-download"></i> Download
        `;
        // Use the original (potentially non-string) filename for the download attribute if needed, 
        // but it's safer to use the processed displayFileName
        downloadButton.setAttribute('download', displayFileName);

        fileElement.appendChild(fileInfo);
        fileElement.appendChild(downloadButton);

        parentElement.appendChild(fileElement);
        scrollToBottomIfNeeded(parentElement);

        return fileElement;
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
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function scrollToBottomIfNeeded(parentElement) {
        // Nur scrollen, wenn das Element direkt zum Haupt-Chat hinzugefügt wird
        if (parentElement === chatMessages) {
            scrollToBottom();
        }
    }

    // --- Nachrichten senden --- 
    function handleSendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        // Add the user's message to the chat
        addMessage(message, 'user');
        messageInput.value = '';

        // Show loading indicator
        updateStatusDisplay('Processing your request...', 'loading');

        // Submit to server with user ID
        socket.emit('submit_task', { 
            task: message, 
            userId: userId 
        });

        // Disable input while processing
        messageInput.disabled = true;
        sendButton.disabled = true;
    }

    sendButton.addEventListener('click', handleSendMessage);
    messageInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            handleSendMessage();
        }
    });

    // --- Socket Event Listener (vom Server empfangen) ---

    // Listener für einfache Textnachrichten von der AI
    socket.on('ai_message', (data) => {
        addMessage(data.text, 'ai');
        updateStatusDisplay('Ready', 'idle'); // Reset status after AI replies
    });

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

     // Listener for file events - UPDATED with type check
     socket.on('file_updated', (data) => {
         if (data.filePath && typeof data.filePath === 'string') {
             const fileName = data.filePath.split(/[\\/]/).pop() || data.filePath; // Extract filename or use full path
             addFileDisplayElement(fileName, data.filePath);
         } else {
            console.warn("Received file_updated event with invalid filePath:", data);
         }
         if (data.content) {
             console.log("File content (from update):");
         }
     });

     // Listener for User Files - UPDATED with type checks
     socket.on('user_files', (data) => {
         if (data.files && Array.isArray(data.files) && data.files.length > 0) {
             // Use a more descriptive title based on context if needed
             const filesGroupContent = addStepGroup(`Available Files (${data.files.length})`, false);
             data.files.forEach(fileInfo => {
                if (fileInfo && typeof fileInfo.fileName === 'string' && typeof fileInfo.path === 'string') {
                     addFileDisplayElement(fileInfo.fileName, fileInfo.path, filesGroupContent);
                 } else if (typeof fileInfo === 'string') {
                     // Fallback for string paths
                     const fileName = fileInfo.split(/[\\/]/).pop() || fileInfo;
                     const safeUserId = (typeof data.userId === 'string') ? data.userId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'unknown_user';
                     const filePath = `output/${safeUserId}/${fileInfo}`;
                     addFileDisplayElement(fileName, filePath, filesGroupContent);
                 } else {
                     console.warn("Received invalid file info in user_files:", fileInfo);
                 }
             });
         }
     });

    // Listener for task completion - UPDATED with type check
    socket.on('task_completed', (data) => {
        // Only process events for the current user
        if (data.userId === userId) {
            console.log('Task completed:', data);
            const result = data.result || 'Task completed successfully';
            
            addMessage(result, 'ai');
            updateStatusDisplay('Task completed', 'completed');
            
            // Re-enable input
            messageInput.disabled = false;
            sendButton.disabled = false;
            
            // Display output files if provided directly in this event
            if (data.outputFiles && Array.isArray(data.outputFiles) && data.outputFiles.length > 0) {
                 const filesGroupContent = addStepGroup(`Result Files (${data.outputFiles.length})`, false);
                 data.outputFiles.forEach(fileInfo => {
                     if (fileInfo && typeof fileInfo.fileName === 'string' && typeof fileInfo.path === 'string') {
                        addFileDisplayElement(fileInfo.fileName, fileInfo.path, filesGroupContent);
                     } else {
                         console.warn("Received invalid file info in task_completed outputFiles:", fileInfo);
                     }
                 });
             }
             // Add a final summary action element (optional)
             const metricsSummary = data.metrics ? `${data.metrics.successCount}/${data.metrics.totalSteps} steps successful.` : '';
             const durationSummary = data.duration ? `Duration: ${(data.duration / 1000).toFixed(1)}s.` : '';
             addActionElement('Task Summary', `${durationSummary} ${metricsSummary}`.trim(), 'task_completed');
        }
    });

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

}); 