document.addEventListener('DOMContentLoaded', () => {
    
    if (typeof gsap !== 'undefined' && gsap.registerPlugin) {
        gsap.registerPlugin(ScrollTrigger);
    }

    
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#' || !document.querySelector(targetId)) return;

            const targetElement = document.querySelector(targetId);
            const headerOffset = document.getElementById('main-header')?.offsetHeight || 0;
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
                top: offsetPosition,
                behavior: "smooth"
            });

            
            const navLinks = document.querySelector('.nav-links');
            const menuToggle = document.querySelector('.menu-toggle');
            if (navLinks && navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                menuToggle.classList.remove('active');
                document.body.classList.remove('no-scroll');
            }
        });
    });

    
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuToggle.classList.toggle('active');
            document.body.classList.toggle('no-scroll'); 
        });
    }

    
    const header = document.getElementById('main-header');
    const banner = document.querySelector('.beta-banner');
    const bannerHeight = banner ? banner.offsetHeight : 0;
    const scrollThreshold = 50;

    function toggleHeaderClass() {
        if (window.scrollY > scrollThreshold) {
            if (header) header.classList.add('scrolled');
        } else {
            if (header) header.classList.remove('scrolled');
        }
    }
    
    window.addEventListener('scroll', toggleHeaderClass);
    toggleHeaderClass();

    
        
    
    const shapes = document.querySelectorAll(".hero-visual .shape");
    if (shapes.length > 0 && typeof gsap !== 'undefined') {
        
        gsap.to(shapes, {
            duration: 20,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: {
                each: 2,
                from: "random"
            },
            x: "random(-30, 30)",
            y: "random(-30, 30)",
        });
    }

    
    const waitlistForm = document.querySelector('.waitlist-form');
    if (waitlistForm) {
        waitlistForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const emailInput = this.querySelector('input[type="email"]');
            const submitButton = this.querySelector('button[type="submit"]');

            if (emailInput.value.trim() === "" || !emailInput.checkValidity()) {
                alert("Please enter a valid email address.");
                emailInput.focus();
                return;
            }

            
            submitButton.textContent = 'Sending...';
            submitButton.disabled = true;
            emailInput.disabled = true;

            setTimeout(() => {
                submitButton.textContent = 'Invite Requested!';
                
                 const successMessage = document.createElement('p');
                 successMessage.textContent = "Thanks! We'll be in touch soon.";
                 successMessage.style.color = "var(--primary)";
                 successMessage.style.marginTop = "10px";
                 this.appendChild(successMessage);
            }, 1500);
        });
    }

    
    window.addEventListener('load', () => {
        document.body.classList.add('content-loaded');
        
        
        const elements = document.querySelectorAll('h1, h2, h3, h4, h5, p, a, button, input, .hero-headline, .hero-subheadline, .hero-cta, .invite-note, .section-title, .section-subtitle, .step-card, .use-case-card, .waitlist-form');
        elements.forEach(el => {
            el.style.opacity = '1';
            el.style.visibility = 'visible';
            el.style.transform = 'none';
        });
    });
});


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

    
    document.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        
        
        if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
            interactionStrength = Math.min(interactionStrength + 0.05, 1);
        } else {
            interactionStrength = Math.max(interactionStrength - 0.05, 0);
        }
    });

    
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
                '99, 102, 241', 
                '236, 72, 153',  
                '255, 255, 255'  
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        }

        update() {
            
            this.pulsePhase += this.pulseSpeed;
            const pulseFactor = (Math.sin(this.pulsePhase) + 1) * 0.2 + 0.8;

            
            const dx = mouseX - this.x;
            const dy = mouseY - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = 150;

            
            if (distance < maxDistance && interactionStrength > 0) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const force = (maxDistance - distance) / maxDistance;
                const directionX = -forceDirectionX * force * interactionStrength * 2;
                const directionY = -forceDirectionY * force * interactionStrength * 2;
                
                this.x += directionX;
                this.y += directionY;
            }

            
            const returnSpeed = 0.02;
            this.x += (this.originalX - this.x) * returnSpeed;
            this.y += (this.originalY - this.y) * returnSpeed;

            
            this.x += this.velocity.x;
            this.y += this.velocity.y;

            
            if (this.x < 0 || this.x > width) this.velocity.x *= -1;
            if (this.y < 0 || this.y > height) this.velocity.y *= -1;

            
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius * pulseFactor, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
            ctx.fill();
        }
    }

    
    class Connection {
        constructor(startNode, endNode) {
            this.startNode = startNode;
            this.endNode = endNode;
            this.opacity = Math.random() * 0.15 + 0.05;
            this.pulseSpeed = 0.04 + Math.random() * 0.03;
            this.pulsePhase = Math.random() * Math.PI * 2;
        }

        update() {
            
            const dx = this.endNode.x - this.startNode.x;
            const dy = this.endNode.y - this.startNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = 150; 
            
            if (distance < maxDistance) {
                
                this.pulsePhase += this.pulseSpeed;
                const pulseFactor = (Math.sin(this.pulsePhase) + 1) * 0.5;
                const opacityFactor = 1 - (distance / maxDistance);

                
                ctx.beginPath();
                ctx.moveTo(this.startNode.x, this.startNode.y);
                ctx.lineTo(this.endNode.x, this.endNode.y);
                ctx.strokeStyle = `rgba(99, 102, 241, ${this.opacity * opacityFactor * pulseFactor})`;
                ctx.lineWidth = opacityFactor * 2;
                ctx.stroke();

                
                this.drawDataParticle(distance, pulseFactor);
            }
        }

        drawDataParticle(distance, pulseFactor) {
            
            const particlePosition = (Date.now() % 3000) / 3000; 
            const x = this.startNode.x + (this.endNode.x - this.startNode.x) * particlePosition;
            const y = this.startNode.y + (this.endNode.y - this.startNode.y) * particlePosition;
            
            
            if ((this.startNode.x + this.endNode.y) % 5 === 0) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(236, 72, 153, ${0.8 * pulseFactor})`;
                ctx.fill();
            }
        }
    }

    
    function initializeNodes() {
        
        nodes = [];
        connections = [];
        
        
        const nodeCount = Math.min(Math.floor(width / 30), 40); 
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) * 0.4; 
        
        for (let i = 0; i < nodeCount; i++) {
            
            const layer = Math.floor(Math.random() * 3); 
            const angle = Math.random() * Math.PI * 2;
            const distance = (layer + 1) * (maxRadius / 3) * (0.7 + Math.random() * 0.6);
            
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            const radius = 3 + Math.random() * 3; 
            
            nodes.push(new Node(x, y, radius));
        }
        
        
        for (let i = 0; i < 5; i++) {
            const angle = (i / 5) * Math.PI * 2;
            const distance = maxRadius * 0.2;
            const x = centerX + Math.cos(angle) * distance;
            const y = centerY + Math.sin(angle) * distance;
            nodes.push(new Node(x, y, 4 + Math.random() * 2));
        }
        
        
        for (let i = 0; i < nodes.length; i++) {
            const connectionsPerNode = 1 + Math.floor(Math.random() * 3); 
            for (let j = 0; j < connectionsPerNode; j++) {
                const targetIndex = Math.floor(Math.random() * nodes.length);
                if (targetIndex !== i) {
                    connections.push(new Connection(nodes[i], nodes[targetIndex]));
                }
            }
        }
    }

    
    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        
        connections.forEach(connection => connection.update());
        
        
        nodes.forEach(node => node.update());
        
        animationFrame = requestAnimationFrame(animate);
    }

    
    function startVisualization() {
        
        initializeNodes();
        
        
        animate();
    }

    
    window.addEventListener('beforeunload', () => {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    });

    startVisualization();
}


function createParticlesBackground() {
    
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
    
    
    const size = Math.random() * 5 + 3;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left = Math.random() * 100;
    const duration = Math.random() * 20 + 10;
    const delay = Math.random() * 10;
    
    
    particle.style.position = 'absolute';
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = color;
    particle.style.borderRadius = '50%';
    particle.style.left = `${left}%`;
    particle.style.top = `${Math.random() * 100}%`;
    particle.style.opacity = Math.random();
    particle.style.animation = `float ${duration}s ease-in-out ${delay}s infinite alternate`;
    
    
    container.appendChild(particle);
}


function animateCounters() {
    const counters = document.querySelectorAll('.counter');
    
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; 
        const step = Math.ceil(target / (duration / 16)); 
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
        
        
        setTimeout(() => {
            cursorDot.style.left = `${e.clientX}px`;
            cursorDot.style.top = `${e.clientY}px`;
        }, 50);
    });

    
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