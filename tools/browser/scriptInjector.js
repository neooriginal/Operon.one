const elementNumberingScript = `
(function() {
    // Clear any previous elements
    window.aiIndexedElements = window.aiIndexedElements || [];
    
    // Remove any previously added element number labels
    const existingLabels = document.querySelectorAll('div[data-ai-element-number]');
    existingLabels.forEach(label => label.remove());
    
    // Reset outlines on previously indexed elements
    if (window.aiIndexedElements.length > 0) {
        window.aiIndexedElements.forEach(el => {
            if (el && el.style) {
                el.style.outline = '';
            }
        });
    }
    
    // Select all interactive elements
    let elements = document.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"]), [onclick], [role="button"], [role="checkbox"], [role="radio"], [role="switch"], [role="menuitem"], [role="tab"], [role="combobox"]');
    window.aiIndexedElements = [];
    
    elements = Array.from(elements).filter(el => {
        // Filter visible elements
        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);
        
        return rect.width > 0 && 
               rect.height > 0 && 
               computedStyle.display !== 'none' && 
               computedStyle.visibility !== 'hidden' && 
               computedStyle.opacity !== '0' &&
               el.type !== 'hidden' &&
               // Allow elements slightly outside viewport
               rect.bottom >= -100 && 
               rect.right >= -100 && 
               rect.top <= (window.innerHeight + 100) && 
               rect.left <= (window.innerWidth + 100);
    });
    
    // Helper to get a descriptive text for each element
    const getElementDescription = (el) => {
        let desc = '';
        if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            desc = el.textContent.trim() || el.getAttribute('aria-label') || 'Unnamed button';
        } else if (el.tagName === 'INPUT') {
            if (['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(el.type)) {
                desc = el.placeholder || el.value || 'Text input';
            } else if (el.type === 'checkbox' || el.type === 'radio') {
                desc = el.getAttribute('aria-label') || 'Checkbox/Radio';
            } else {
                desc = el.value || 'Input';
            }
        } else if (el.tagName === 'A') {
            desc = el.textContent.trim() || el.getAttribute('aria-label') || 'Link';
        } else if (el.tagName === 'TEXTAREA') {
            desc = el.placeholder || el.value || 'Textarea';
        } else {
            desc = el.textContent.trim() || el.getAttribute('aria-label') || el.id || el.className || el.tagName;
        }
        return desc;
    };
    
    // Helper to determine color based on element type
    const getElementColor = (el) => {
        // Color-code by element type
        if (el.tagName === 'INPUT') {
            switch(el.type) {
                case 'text':
                case 'email':
                case 'password':
                case 'search':
                case 'tel':
                case 'url':
                case 'number':
                    return '#4285F4'; // Blue for text inputs
                case 'checkbox':
                case 'radio':
                    return '#0F9D58'; // Green for checkboxes/radios
                case 'submit':
                case 'button':
                    return '#DB4437'; // Red for button inputs
                default:
                    return '#F4B400'; // Yellow for other inputs
            }
        } else if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') {
            return '#DB4437'; // Red for buttons
        } else if (el.tagName === 'A') {
            return '#9C27B0'; // Purple for links
        } else if (el.tagName === 'SELECT' || el.getAttribute('role') === 'combobox') {
            return '#FF9800'; // Orange for dropdowns
        } else if (el.tagName === 'TEXTAREA') {
            return '#4285F4'; // Blue for textareas
        }
        return '#757575'; // Gray for other elements
    };
    
    // Create window.numberedElements for references through numeric ID
    window.numberedElements = {};
    
    elements.forEach((el, index) => {
        window.aiIndexedElements.push(el);
        const number = index + 1;
        window.numberedElements[number] = el;
        
        const rect = el.getBoundingClientRect();
        const elementType = el.tagName.toLowerCase();
        const elementWidth = rect.width;
        const elementHeight = rect.height;
        
        // Log element for debugging
        console.log(\`Element \${number}: \${elementType} - \${getElementDescription(el)}\`);
        
        // Create a label with the element number
        let label = document.createElement('div');
        label.setAttribute('data-ai-element-number', number);
        label.textContent = number;
        label.style.position = 'absolute';
        label.style.zIndex = '2147483647'; // Max z-index
        
        // Get appropriate color for the element type
        const backgroundColor = getElementColor(el);
        
        // Style the label
        label.style.background = backgroundColor;
        label.style.color = 'white';
        label.style.padding = '2px 4px';
        label.style.borderRadius = '4px';
        label.style.fontSize = '12px';
        label.style.fontWeight = 'bold';
        label.style.pointerEvents = 'none';
        label.style.boxShadow = '0 0 3px rgba(0, 0, 0, 0.5)';
        label.style.textAlign = 'center';
        label.style.fontFamily = 'Arial, sans-serif';
        label.style.border = '1px solid rgba(255, 255, 255, 0.5)';
        label.style.minWidth = '16px';
        label.style.lineHeight = '16px';
        
        // Position label depending on element size
        if (elementWidth < 30 || elementHeight < 20) {
            // For small elements, place the label above
            label.style.left = \`\${window.scrollX + rect.left}px\`;
            label.style.top = \`\${window.scrollY + rect.top - 18}px\`;
        } else {
            // For larger elements, place the label on the top-right corner
            label.style.left = \`\${window.scrollX + rect.right - 20}px\`;
            label.style.top = \`\${window.scrollY + rect.top}px\`;
        }
        
        document.body.appendChild(label);
        
        // Highlight the element with an outline
        el.style.outline = \`2px solid \${backgroundColor}88\`;
    });
    
    // Function to click on elements by their number
    window.clickElement = function(number) {
        if (number < 1 || number > window.aiIndexedElements.length) {
            console.warn('No element found with number:', number);
            return false;
        }
        
        const el = window.aiIndexedElements[number - 1];
        if (!el) {
            console.warn('Element is no longer in the DOM:', number);
            return false;
        }
        
        try {
            el.scrollIntoView({behavior: 'smooth', block: 'center'});
            setTimeout(() => {
                try {
                    const originalOutline = el.style.outline;
                    el.style.outline = '3px solid lime';
                    
                    try {
                        el.click();
                    } catch (e) {
                        console.log('Direct click failed, trying event dispatch', e);
                    }
                    
                    const rect = el.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    
                    ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                        const clickEvent = new MouseEvent(eventType, {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            clientX: centerX,
                            clientY: centerY
                        });
                        el.dispatchEvent(clickEvent);
                    });
                    
                    if (el.tagName === 'A' && el.href) {
                        setTimeout(() => {
                            if (!document.documentElement.contains(el)) return;
                            window.location.href = el.href;
                        }, 100);
                    } else if (el.tagName === 'BUTTON' || 
                               (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button'))) {
                        if (el.form) {
                            setTimeout(() => {
                                if (!document.documentElement.contains(el)) return;
                                try { el.form.submit(); } catch (e) { console.log('Form submit failed', e); }
                            }, 100);
                        }
                    }
                    
                    setTimeout(() => {
                        if (document.documentElement.contains(el)) {
                            el.style.outline = originalOutline;
                        }
                    }, 500);
                } catch (innerError) {
                    console.error('Error in click operation:', innerError);
                }
            }, 100);
            
            return true;
        } catch (error) {
            console.error('Error clicking element:', error);
            return false;
        }
    };
    
    // Function to focus on elements by their number
    window.focusElement = function(number) {
        if (number < 1 || number > window.aiIndexedElements.length) {
            console.warn('No element found with number:', number);
            return false;
        }
        
        const el = window.aiIndexedElements[number - 1];
        if (!el) {
            console.warn('Element is no longer in the DOM:', number);
            return false;
        }
        
        try {
            el.scrollIntoView({behavior: 'smooth', block: 'center'});
            setTimeout(() => {
                try {
                    el.focus();
                    if ((el.tagName === 'INPUT' && ['text', 'password', 'email', 'search', 'tel', 'url'].includes(el.type)) || 
                        el.tagName === 'TEXTAREA') {
                        el.select();
                    }
                    
                    const originalOutline = el.style.outline;
                    el.style.outline = '3px solid #4285F4';
                    
                    setTimeout(() => {
                        if (document.documentElement.contains(el)) {
                            el.style.outline = originalOutline;
                        }
                    }, 500);
                } catch (innerError) {
                    console.error('Error in focus operation:', innerError);
                }
            }, 100);
            
            return true;
        } catch (error) {
            console.error('Error focusing element:', error);
            return false;
        }
    };
    
    // Function to get detailed information about elements
    window.getElementInfo = function(number) {
        if (number < 1 || number > window.aiIndexedElements.length) {
            console.warn('No element found with number:', number);
            return null;
        }
        
        const el = window.aiIndexedElements[number - 1];
        if (!el) {
            console.warn('Element is no longer in the DOM:', number);
            return null;
        }
        
        try {
            const rect = el.getBoundingClientRect();
            let visibleText = el.textContent || '';
            
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                visibleText = el.value || el.placeholder || '';
            }
            
            visibleText = visibleText.trim().replace(/\\s+/g, ' ');
            
            const elementContext = {
                innerText: visibleText,
                ariaLabel: el.getAttribute('aria-label') || '',
                title: el.getAttribute('title') || '',
                alt: el.getAttribute('alt') || '',
                labelText: ''
            };
            
            if (el.id) {
                const label = document.querySelector(\`label[for="\${el.id}"]\`);
                if (label) {
                    elementContext.labelText = label.textContent.trim();
                }
            }
            
            return {
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                id: el.id || '',
                className: el.className || '',
                value: el.value || '',
                placeholder: el.placeholder || '',
                text: visibleText,
                context: elementContext,
                position: {
                    x: rect.left,
                    y: rect.top,
                    width: rect.width,
                    height: rect.height
                },
                isVisible: rect.width > 0 && rect.height > 0,
                isEnabled: !el.disabled,
                isReadOnly: el.readOnly || false,
                attributes: Array.from(el.attributes).map(attr => ({
                    name: attr.name,
                    value: attr.value
                }))
            };
        } catch (error) {
            console.error('Error getting element info:', error);
            return null;
        }
    };
    
    // Highlight iframes to indicate they exist
    function handleIframes() {
        try {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    if (iframe.contentDocument) {
                        iframe.style.border = '2px dashed #FF9800';
                    }
                } catch (e) {
                    console.log('Cross-origin iframe detected');
                }
            });
        } catch (e) {
            console.error('Error handling iframes:', e);
        }
    }
    
    handleIframes();
    
    return true;
})();
`;

module.exports = elementNumberingScript;
