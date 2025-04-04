// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize AOS (Animate On Scroll)
    AOS.init({
        duration: 800,
        easing: 'ease-out',
        once: false,
        mirror: true
    });

    // Initialize neural network visualization
    initNetworkVisualization();

    // Navigation menu toggle for mobile
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            menuToggle.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        // Close mobile menu when clicking on a navigation link
        const navItems = document.querySelectorAll('.nav-links a');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                menuToggle.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    // Sticky header on scroll
    const header = document.querySelector('header');
    const scrollThreshold = 50;

    function toggleHeaderClass() {
        if (window.scrollY > scrollThreshold) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    window.addEventListener('scroll', toggleHeaderClass);
    toggleHeaderClass(); // Check initial state

    // Smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const offsetTop = targetElement.getBoundingClientRect().top + window.pageYOffset;
                const headerHeight = header.offsetHeight;
                
                window.scrollTo({
                    top: offsetTop - headerHeight,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Parallax effect for hero section
    const heroSection = document.getElementById('hero');
    
    window.addEventListener('scroll', () => {
        if (heroSection) {
            const scrollY = window.scrollY;
            heroSection.style.backgroundPositionY = `${scrollY * 0.5}px`;
        }
    });

    // Create particles background effect
    createParticlesBackground();

    // Animated counters for statistics (if applicable)
    animateCounters();

    // Form validation for contact form
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        const formInputs = contactForm.querySelectorAll('input, textarea');
        const submitButton = contactForm.querySelector('button');

        if (submitButton) {
            submitButton.addEventListener('click', (e) => {
                e.preventDefault();
                
                let isValid = true;
                formInputs.forEach(input => {
                    if (input.value.trim() === '') {
                        isValid = false;
                        input.style.borderColor = 'var(--secondary)';
                        
                        // Add shake animation
                        input.classList.add('shake');
                        setTimeout(() => {
                            input.classList.remove('shake');
                        }, 500);
                    } else {
                        input.style.borderColor = 'var(--gray-dark)';
                    }
                });

                if (isValid) {
                    // Simulate form submission success
                    submitButton.textContent = 'Thanks!';
                    submitButton.disabled = true;
                    
                    // Reset form after simulated success
                    setTimeout(() => {
                        formInputs.forEach(input => input.value = '');
                        submitButton.textContent = 'Request Access';
                        submitButton.disabled = false;
                    }, 3000);
                }
            });
        }

        // Reset validation styling on input
        formInputs.forEach(input => {
            input.addEventListener('input', () => {
                input.style.borderColor = 'var(--gray-dark)';
            });
        });
    }
    
    // Add dynamic typing effect to hero subtitle
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) {
        const originalText = subtitle.textContent;
        subtitle.textContent = '';
        
        let i = 0;
        const typeWriter = () => {
            if (i < originalText.length) {
                subtitle.textContent += originalText.charAt(i);
                i++;
                setTimeout(typeWriter, 30);
            }
        };
        
        // Start typing after a delay
        setTimeout(typeWriter, 500);
    }
});

// Neural Network Visualization
function initNetworkVisualization() {
    const canvas = document.getElementById('networkCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let nodes = [];
    let connections = [];
    let animationFrame;
    let mouseX = 0;
    let mouseY = 0;
    let interactionStrength = 0;

    // Set canvas dimensions
    function setCanvasDimensions() {
        const container = canvas.parentElement;
        width = container.offsetWidth;
        height = container.offsetHeight;
        canvas.width = width;
        canvas.height = height;
    }

    setCanvasDimensions();
    window.addEventListener('resize', () => {
        setCanvasDimensions();
        initializeNodes();
    });

    // Track mouse movement for interactivity
    document.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        // Increase interaction strength when mouse is over canvas
        if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
            interactionStrength = Math.min(interactionStrength + 0.05, 1);
        } else {
            interactionStrength = Math.max(interactionStrength - 0.05, 0);
        }
    });

    // Node class for visualization
    class Node {
        constructor(x, y, radius) {
            this.x = x;
            this.y = y;
            this.originalX = x;
            this.originalY = y;
            this.radius = radius;
            this.color = this.getRandomColor();
            this.velocity = {
                x: (Math.random() - 0.5) * 0.5,
                y: (Math.random() - 0.5) * 0.5
            };
            this.opacity = Math.random() * 0.5 + 0.5;
            this.pulsePhase = Math.random() * Math.PI * 2;
            this.pulseSpeed = 0.05 + Math.random() * 0.05;
        }

        getRandomColor() {
            const colors = [
                '99, 102, 241', // Indigo (primary)
                '236, 72, 153',  // Pink (secondary)
                '255, 255, 255'  // White
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            // Pulse effect
            this.pulsePhase += this.pulseSpeed;
            const pulseFactor = (Math.sin(this.pulsePhase) + 1) * 0.2 + 0.8;

            // Calculate distance from mouse
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = 150;

            // Move away from mouse cursor
            if (distance < maxDistance && interactionStrength > 0) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (maxDistance - distance) / maxDistance;
                const directionX = -forceDirectionX * force * interactionStrength * 2;
                const directionY = -forceDirectionY * force * interactionStrength * 2;
                
                this.x += directionX;
                this.y += directionY;
            }

            // Return to original position slowly
            const returnSpeed = 0.02;
            this.x += (this.originalX - this.x) * returnSpeed;
            this.y += (this.originalY - this.y) * returnSpeed;

            // Move with velocity
            this.x += this.velocity.x;
            this.y += this.velocity.y;

            // Bounce off edges
            if (this.x < 0 || this.x > width) this.velocity.x *= -1;
            if (this.y < 0 || this.y > height) this.velocity.y *= -1;

            // Draw node
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * pulseFactor, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
        }
    }

    // Connection class for lines between nodes
    class Connection {
        constructor(startNode, endNode) {
            this.startNode = startNode;
            this.endNode = endNode;
            this.opacity = Math.random() * 0.15 + 0.05;
            this.pulseSpeed = 0.04 + Math.random() * 0.03;
            this.pulsePhase = Math.random() * Math.PI * 2;
        }

        update() {
            // Calculate distance to determine if connection should be drawn
            const dx = this.endNode.x - this.startNode.x;
            const dy = this.endNode.y - this.startNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = 150; // Maximum distance for connection
            
            if (distance < maxDistance) {
                // Pulse animation for the connection
                this.pulsePhase += this.pulseSpeed;
                const pulseFactor = (Math.sin(this.pulsePhase) + 1) * 0.5;
                const opacityFactor = 1 - (distance / maxDistance);

                // Draw the connection
                ctx.beginPath();
                ctx.moveTo(this.startNode.x, this.startNode.y);
                ctx.lineTo(this.endNode.x, this.endNode.y);
                ctx.strokeStyle = `rgba(99, 102, 241, ${this.opacity * opacityFactor * pulseFactor})`;
                ctx.lineWidth = opacityFactor * 2;
                ctx.stroke();

                // Draw data particles moving along the connection
                this.drawDataParticle(distance, pulseFactor);
            }
        }

        drawDataParticle(distance, pulseFactor) {
            // Simple data packet visualization
            const particlePosition = (Date.now() % 3000) / 3000; // Cycle every 3 seconds
            const x = this.startNode.x + (this.endNode.x - this.startNode.x) * particlePosition;
            const y = this.startNode.y + (this.endNode.y - this.startNode.y) * particlePosition;
            
            // Only draw particles on certain connections based on a random condition
            if ((this.startNode.x + this.endNode.y) % 5 === 0) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(236, 72, 153, ${0.8 * pulseFactor})`;
                ctx.fill();
            }
        }
    }

    // Initialize nodes and connections
    function initializeNodes() {
        // Clear previous nodes and connections
        nodes = [];
        connections = [];
        
        // Create nodes
        const nodeCount = Math.min(Math.floor(width / 30), 40); // Responsive node count
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.4; // Network radius
        
        for (let i = 0; i < nodeCount; i++) {
            // Create nodes in layers (concentric circles)
            const layer = Math.floor(Math.random() * 3); // 0, 1, or 2 for three layers
            const angle = Math.random() * Math.PI * 2;
            const distance = (layer + 1) * (maxRadius / 3) * (0.7 + Math.random() * 0.6);
            
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            const radius = 3 + Math.random() * 3; // Node size
            
            nodes.push(new Node(x, y, radius));
        }
        
        // Add some central nodes
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const distance = maxRadius * 0.2;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            nodes.push(new Node(x, y, 4 + Math.random() * 2));
        }
        
        // Create connections between nodes
        for (let i = 0; i < nodes.length; i++) {
            const connectionsPerNode = 1 + Math.floor(Math.random() * 3); // 1-3 connections per node
            for (let j = 0; j < connectionsPerNode; j++) {
                const targetIndex = Math.floor(Math.random() * nodes.length);
                if (targetIndex !== i) {
                    connections.push(new Connection(nodes[i], nodes[targetIndex]));
                }
            }
        }
    }

    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        // Draw connections
        connections.forEach(connection => connection.update());
        
        // Draw nodes
        nodes.forEach(node => node.update());
        
        animationFrame = requestAnimationFrame(animate);
    }

    // Start visualization
    function startVisualization() {
        // Set up
        initializeNodes();
        
        // Start animation loop
        animate();
    }

    // Clean up on page leave
    window.addEventListener('beforeunload', () => {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    });

    startVisualization();
}

// Create a particles background effect
function createParticlesBackground() {
    // Only create particles on larger screens to avoid performance issues on mobile
    if (window.innerWidth < 768) return;

    const heroSection = document.getElementById('hero');
    if (!heroSection) return;

    const particlesContainer = document.createElement('div');
    particlesContainer.className = 'particles-container';
    particlesContainer.style.position = 'absolute';
    particlesContainer.style.top = '0';
    particlesContainer.style.left = '0';
    particlesContainer.style.width = '100%';
    particlesContainer.style.height = '100%';
    particlesContainer.style.overflow = 'hidden';
    particlesContainer.style.zIndex = '0';
    heroSection.prepend(particlesContainer);

    const particleCount = 30;
    const colors = ['rgba(99, 102, 241, 0.5)', 'rgba(236, 72, 153, 0.5)', 'rgba(255, 255, 255, 0.2)'];
    
    for (let i = 0; i < particleCount; i++) {
        createParticle(particlesContainer, colors);
    }
}

function createParticle(container, colors) {
    const particle = document.createElement('div');
    
    // Random properties
    const size = Math.random() * 5 + 3;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = Math.random() * 20 + 10;
    const delay = Math.random() * 10;
    
    // Style the particle
    particle.style.position = 'absolute';
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = color;
    particle.style.borderRadius = '50%';
    particle.style.left = `${left}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.opacity = Math.random();
    particle.style.animation = `float ${duration}s ease-in-out ${delay}s infinite alternate`;
    
    // Add particle to container
    container.appendChild(particle);
}

// Animate counters (if any statistics sections are added later)
function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; // ms
        const step = Math.ceil(target / (duration / 16)); // 60 FPS
        let current = 0;
        
        const updateCounter = () => {
            current += step;
            if (current > target) {
                current = target;
            }
            counter.textContent = current;
            
            if (current < target) {
                requestAnimationFrame(updateCounter);
            }
        };
        
        // Start animation when element is in viewport
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    updateCounter();
                    observer.disconnect();
                }
            },
            { threshold: 0.5 }
        );
        
        observer.observe(counter);
    });
}

// Add some additional animation effects to feature cards
window.addEventListener('load', () => {
    const featureCards = document.querySelectorAll('.feature-card');
    
    featureCards.forEach(card => {
        card.addEventListener('mouseenter', () => {
            const icon = card.querySelector('.feature-icon i');
            icon.style.transform = 'scale(1.2) rotate(5deg)';
            setTimeout(() => {
                icon.style.transform = '';
            }, 300);
        });
    });
});

// Add a shake animation for form validation
const style = document.createElement('style');
style.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-5px); }
    40%, 80% { transform: translateX(5px); }
}
.shake {
    animation: shake 0.5s ease-in-out;
}
`;
document.head.appendChild(style);

// Custom cursor (for desktop)
if (window.innerWidth > 768) {
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.style.position = 'fixed';
    cursor.style.width = '20px';
    cursor.style.height = '20px';
    cursor.style.borderRadius = '50%';
    cursor.style.backgroundColor = 'transparent';
    cursor.style.border = '2px solid var(--primary)';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '9999';
    cursor.style.transform = 'translate(-50%, -50%)';
    cursor.style.transition = 'transform 0.1s ease, width 0.2s, height 0.2s, background-color 0.2s';
    document.body.appendChild(cursor);

    const cursorDot = document.createElement('div');
    cursorDot.className = 'cursor-dot';
    cursorDot.style.position = 'fixed';
    cursorDot.style.width = '5px';
    cursorDot.style.height = '5px';
    cursorDot.style.borderRadius = '50%';
    cursorDot.style.backgroundColor = 'var(--primary)';
    cursorDot.style.pointerEvents = 'none';
    cursorDot.style.zIndex = '9999';
    cursorDot.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(cursorDot);

    document.addEventListener('mousemove', (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
        
        // Delayed follow for dot
        setTimeout(() => {
            cursorDot.style.left = `${e.clientX}px`;
            cursorDot.style.top = `${e.clientY}px`;
        }, 50);
    });

    // Hover effect on interactive elements
    const interactiveElements = document.querySelectorAll('a, button, input, textarea, .feature-card');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.style.width = '40px';
            cursor.style.height = '40px';
            cursor.style.backgroundColor = 'rgba(99, 102, 241, 0.1)';
            cursor.style.borderColor = 'var(--primary)';
        });
        
        el.addEventListener('mouseleave', () => {
            cursor.style.width = '20px';
            cursor.style.height = '20px';
            cursor.style.backgroundColor = 'transparent';
            cursor.style.borderColor = 'var(--primary)';
        });
    });
}

// Add a scroll-triggered animation for sections
const sections = document.querySelectorAll('section');
const observeSection = new IntersectionObserver(
    (entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('section-visible');
            }
        });
    },
    { threshold: 0.2 }
);

sections.forEach(section => {
    section.classList.add('section-hidden');
    observeSection.observe(section);
});

// Add styles for section animations
const sectionStyle = document.createElement('style');
sectionStyle.textContent = `
.section-hidden {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.8s ease, transform 0.8s ease;
}
.section-visible {
    opacity: 1;
    transform: translateY(0);
}
`;
document.head.appendChild(sectionStyle); 