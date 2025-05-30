/**
 * Annotation Tool
 * A tool for adding and managing annotations on images.
 * Features:
 * - Add pins with comments
 * - Zoom to pins
 * - Pan when zoomed
 * - Move pins
 * - Color selection
 * - Share annotations via URL
 */

// Detect view-only mode from URL
function isViewOnlyMode() {
    const urlParams = new URLSearchParams(window.location.search);
    // MVP: view-only if ?view=1 or if image/annotations are present
    return urlParams.get('view') === '1' || urlParams.has('image') || urlParams.has('annotations');
}

class AnnotationTool {
    constructor() {
        // Core state
        this.currentMode = 'move';  // 'move' or 'comment'
        this.currentPinColor = '#00c853';  // Will be updated dynamically after DOM loads
        this.currentActivePin = null;
        this.annotations = [];
        this.uploadedImageData = null; // Store uploaded image in memory
        
        // Panning state
        this.isPanning = false;
        this.hasPanned = false;
        this.startPanX = 0;
        this.startPanY = 0;
        this.currentTranslateX = 0;
        this.currentTranslateY = 0;
        
        // Track the last custom color separately
        this.lastCustomColor = this.currentPinColor;

        // Force viewOnly mode for any shared link
        const urlParams = new URLSearchParams(window.location.search);
        this.viewOnly = urlParams.has('id'); // Only use id for viewOnly

        // Initialize when DOM is ready
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            this.initialize();
            this.setDefaultPinColorFromPicker();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                this.initialize();
                this.setDefaultPinColorFromPicker();
            });
        }

        this.vanillaPicker = null;
        this.vanillaPickerPopup = document.getElementById('vanillaPickerPopup');
        console.log('AnnotationTool constructor');
        console.log('shareBtn in constructor:', document.getElementById('shareBtn'));

        this.toolbarHandlersAttached = false;

        this.zoomLevel = 1; // Default zoom
        this.minZoom = 0.5;
        this.maxZoom = 4;
        this.zoomStep = 0.2;
    }

    /**
     * Set the default pin color based on the color picker active button
     */
    setDefaultPinColorFromPicker() {
        const activeColorBtn = document.querySelector('.color-option.active');
        if (activeColorBtn && activeColorBtn.dataset.color) {
            this.currentPinColor = activeColorBtn.dataset.color;
        } else {
            this.currentPinColor = '#00c853'; // fallback
        }
    }

    /**
     * Initialize the tool by setting up DOM elements and event listeners
     */
    initialize() {
        console.log('AnnotationTool initialize');
        console.log('shareBtn in initialize:', document.getElementById('shareBtn'));
        
        // Get DOM elements
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.annotationImage = document.getElementById('annotationImage');
        this.imageAnnotationWrapper = document.querySelector('.image-annotation-wrapper');
        this.annotationsLayer = document.getElementById('annotationsLayer');
        this.toolbar = document.getElementById('toolbar');
        this.topNav = document.getElementById('topNav');
        
        // Set up event listeners
        this.attachToolbarHandlers();
        this.setupColorPickerHandlers();
        this.setMode('move'); // Set initial mode
        this.setupFileHandlers();
        this.setupAnnotationHandlers();
        this.setupPanning();
        
        // Load from URL if parameters exist
        this.loadFromUrl();

        // Show view-only badge if needed
        const viewOnlyBadge = document.getElementById('viewOnlyBadge');
        if (this.viewOnly && viewOnlyBadge) {
            viewOnlyBadge.style.display = 'block';
        } else if (viewOnlyBadge) {
            viewOnlyBadge.style.display = 'none';
        }
        // Always hide toolbar in view-only mode
        if (this.toolbar) this.toolbar.style.display = this.viewOnly ? 'none' : 'flex';
        // Hide color picker in view-only mode
        const colorPickerMenu = document.getElementById('colorPickerMenu');
        if (this.viewOnly && colorPickerMenu) colorPickerMenu.style.display = 'none';

        // At the end of initialize, set up zoom controls
        this.setupZoomControls();
    }

    attachToolbarHandlers() {
        if (this.toolbarHandlersAttached) return;
        this.toolbarHandlersAttached = true;
        if (this.viewOnly) return;
        const moveBtn = document.getElementById('moveBtn');
        const commentBtn = document.getElementById('commentBtn');
        const shareBtn = document.getElementById('shareBtn');
        if (moveBtn) moveBtn.addEventListener('click', () => this.setMode('move'));
        if (commentBtn) commentBtn.addEventListener('click', () => this.setMode('comment'));
        if (shareBtn) shareBtn.addEventListener('click', () => this.shareAnnotations());
    }

    setMode(mode) {
        this.currentMode = mode;
        // Update toolbar button states
        const moveBtn = document.getElementById('moveBtn');
        const commentBtn = document.getElementById('commentBtn');
        const shareBtn = document.getElementById('shareBtn');
        if (moveBtn) moveBtn.classList.toggle('active', mode === 'move');
        if (commentBtn) commentBtn.classList.toggle('active', mode === 'comment');
        if (shareBtn) shareBtn.classList.toggle('active', mode === 'share');
        // Always hide all popups first
        this.hideAllPopups();
        // Only show color picker menu in comment mode
        if (mode === 'comment') {
            const colorPickerMenu = document.getElementById('colorPickerMenu');
            if (colorPickerMenu) colorPickerMenu.style.display = 'flex';
            this.setupColorPickerHandlers();
        }
        // Only show share popup in share mode
        if (mode === 'share') {
            this.showSharePopup();
            const sharePopup = document.getElementById('sharePopup');
            if (sharePopup) sharePopup.style.display = 'flex';
        }
        // Set cursor
        if (this.annotationsLayer) {
            this.annotationsLayer.style.cursor = mode === 'move' ? 'move' : 'pointer';
        }
    }

    hideAllPopups() {
        const colorPickerMenu = document.getElementById('colorPickerMenu');
        const sharePopup = document.getElementById('sharePopup');
        if (colorPickerMenu) colorPickerMenu.style.display = 'none';
        if (sharePopup) sharePopup.style.display = 'none';
        // Hide other popups if needed
    }

    async shareAnnotations() {
        // Show popup immediately with loading state
        this.lastShareUrl = null;
        this.setMode('share');
        this.showSharePopup('loading');
        try {
            window.focus();
            
            // Validate image data
            if (!this.uploadedImageData) {
                throw new Error('No image data available. Please upload an image first.');
            }

            const response = await fetch('/.netlify/functions/share', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: this.uploadedImageData,
                    annotations: this.annotations
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                console.error('Server error response:', errorBody);
                throw new Error('Failed to create share');
            }

            const { id } = await response.json();
            const shareUrl = `${window.location.origin}/index.html?id=${id}`;
            this.lastShareUrl = shareUrl;
            this.showSharePopup(); // Update popup with real link
        } catch (error) {
            console.error('Error sharing:', error);
            this.showSharePopup('error');
            // Show a more specific error message to the user
            const shareLinkText = document.getElementById('shareLinkText');
            if (shareLinkText) {
                shareLinkText.textContent = error.message || 'Error generating link. Please try again.';
            }
        }
    }

    showSharePopup(state) {
        const sharePopup = document.getElementById('sharePopup');
        const shareLinkText = document.getElementById('shareLinkText');
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        const copyIconImg = document.getElementById('copyIconImg');
        const shareBtn = document.getElementById('shareBtn');
        const moveBtn = document.getElementById('moveBtn');
        const commentBtn = document.getElementById('commentBtn');
        if (!sharePopup || !shareLinkText || !copyLinkBtn || !copyIconImg || !shareBtn) return;
        let shareUrl = this.lastShareUrl || '';
        if (state === 'loading') {
            shareLinkText.textContent = 'Generating link…';
            shareLinkText.title = '';
            shareLinkText.setAttribute('data-full-link', '');
            copyLinkBtn.disabled = true;
            copyIconImg.style.opacity = 0.5;
        } else if (state === 'error') {
            shareLinkText.textContent = 'Error generating link. Please try again.';
            shareLinkText.title = '';
            shareLinkText.setAttribute('data-full-link', '');
            copyLinkBtn.disabled = true;
            copyIconImg.style.opacity = 0.5;
        } else {
            shareLinkText.textContent = shareUrl;
            shareLinkText.title = shareUrl;
            shareLinkText.setAttribute('data-full-link', shareUrl);
            copyLinkBtn.disabled = false;
            copyIconImg.style.opacity = 1;
        }
        // Add a copy event listener so that copying the text copies the full link
        shareLinkText.oncopy = function(e) {
            e.preventDefault();
            const fullLink = shareLinkText.getAttribute('data-full-link');
            if (e.clipboardData) {
                e.clipboardData.setData('text/plain', fullLink);
            } else if (window.clipboardData) {
                window.clipboardData.setData('Text', fullLink);
            }
        };
        // Only the share button is active
        if (moveBtn) moveBtn.classList.remove('active');
        if (commentBtn) commentBtn.classList.remove('active');
        shareBtn.classList.add('active');
        // Remove any previous click handler
        copyLinkBtn.onclick = null;
        copyLinkBtn.onclick = async () => {
            try {
                await navigator.clipboard.writeText(shareUrl);
                copyIconImg.src = 'assets/icons/checkmark.svg';
                copyLinkBtn.classList.add('copied');
                setTimeout(() => {
                    copyIconImg.src = 'assets/icons/copy.svg';
                    copyLinkBtn.classList.remove('copied');
                }, 1200);
            } catch (err) {
                prompt('Copy this URL to share:', shareUrl);
            }
        };
        // Remove any previous close handler
        document.removeEventListener('mousedown', this._sharePopupCloseHandler, true);
        // Define and attach a new close handler
        this._sharePopupCloseHandler = (e) => {
            if (
                sharePopup.style.display === 'flex' &&
                !sharePopup.contains(e.target) &&
                e.target !== shareBtn
            ) {
                sharePopup.style.display = 'none';
                if (shareBtn) shareBtn.classList.remove('active');
                document.removeEventListener('mousedown', this._sharePopupCloseHandler, true);
            }
        };
        setTimeout(() => {
            document.addEventListener('mousedown', this._sharePopupCloseHandler, true);
        }, 0);
    }

    /**
     * Set up file upload handlers
     */
    setupFileHandlers() {
        // Handle drag and drop
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) {
                this.handleImageUpload(file);
            }
        });

        // Handle file input
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleImageUpload(file);
            }
        });
    }

    /**
     * Set up annotation-related event handlers
     */
    setupAnnotationHandlers() {
        // Allow pin click/zoom in view-only mode, but only block adding new pins
        this.annotationsLayer.addEventListener('click', (e) => {
            // Don't handle if we were panning (a significant drag)
            if (this.hasPanned) {
                this.hasPanned = false;
                return;
            }
            // Prevent zoom out or closing if clicking inside a comment
            if (e.target.closest('.annotation-comment')) {
                return;
            }
            const pin = e.target.closest('.annotation-pin');
            if (pin) {
                // Handle pin click (always allow)
                this.handlePinClick(pin, e);
            } else if (!this.viewOnly && this.currentMode === 'comment' && 
                      (e.target === this.annotationsLayer || e.target === this.annotationImage)) {
                // Add new pin in comment mode (only if not view-only)
                this.addNewPin(e);
            } else if (this.imageAnnotationWrapper.classList.contains('zoomed')) {
                // Zoom out when clicking the image while zoomed (only if it was a tap/click, not a drag)
                console.log('Tap/Click detected, zooming out');
                this.zoomOut();
            }
        });
        // Prevent context menu on long press on touch devices which could interfere with tap
        this.annotationsLayer.addEventListener('contextmenu', (e) => {
            if (e.touches && e.touches.length > 0) {
                e.preventDefault();
            }
        });
    }

    /**
     * Handle clicks on existing pins
     */
    handlePinClick(pin, e) {
        if (this.currentMode === 'comment') {
            e.stopPropagation();
            return;
        }
        
        const comment = pin.querySelector('.annotation-comment');
        
        // Hide all other comments first
        document.querySelectorAll('.annotation-comment').forEach(c => {
            if (c !== comment) {
                c.classList.remove('open');
            }
        });

        // If already zoomed and this is the active pin
        if (this.imageAnnotationWrapper.classList.contains('zoomed') && pin === this.currentActivePin) {
            if (this.hasPanned) {
                // Recenter if we've panned
                console.log('Pin clicked after pan, recentering');
                this.panToPin(pin);
                this.hasPanned = false;
                // Show the text div and hide the textarea
                const textarea = comment.querySelector('textarea');
                const textDiv = comment.querySelector('.comment-text');
                if (textarea && textDiv) {
                    textarea.style.display = 'none';
                    textDiv.style.display = 'block';
                }
            } else {
                // Zoom out if we haven't panned
                console.log('Pin clicked, zooming out');
                this.zoomOut();
            }
        } else {
            // Zoom to this pin
            console.log('Pin clicked, zooming to pin');
            this.panToPin(pin);
            // Show the comment box
            if (comment) {
                comment.classList.add('open');
                // Show the text div, hide the textarea initially
                const textarea = comment.querySelector('textarea');
                const textDiv = comment.querySelector('.comment-text');
                if (textarea && textDiv) {
                    textarea.style.display = 'none';
                    textDiv.style.display = 'block';
                }
            }
        }
        
        // Update pin opacities
        this.updatePinOpacities(pin);
        e.stopPropagation();
    }

    /**
     * Add a new pin at the clicked position
     */
    addNewPin(e) {
        if (this.viewOnly) return; // Prevent adding pins in view-only mode
        const imgRect = this.annotationImage.getBoundingClientRect();
        const wrapperRect = this.imageAnnotationWrapper.getBoundingClientRect();
        const x = ((e.clientX - imgRect.left) / imgRect.width) * 100;
        const y = ((e.clientY - imgRect.top) / imgRect.height) * 100;
        
        // Hide other comments
        document.querySelectorAll('.annotation-comment').forEach(comment => {
            comment.classList.remove('open');
        });
        
        // Create and add the pin
        const pin = this.addAnnotation(x, y);
        const comment = pin.querySelector('.annotation-comment');
        comment.classList.add('open');
        
        // Focus the textarea
        const textarea = comment.querySelector('textarea');
        if (textarea) {
            textarea.focus();
        }
        
        e.stopPropagation();
    }

    /**
     * Add a new annotation
     */
    addAnnotation(x, y) {
        const id = Date.now().toString();
        const annotation = { 
            id, 
            x, 
            y, 
            text: '',
            color: this.currentPinColor
        };
        
        this.annotations.push(annotation);
        return this.renderAnnotation(annotation);
    }

    /**
     * Render an annotation as a pin with comment box
     */
    renderAnnotation(annotation) {
        // Create pin element
        const pin = document.createElement('div');
        pin.className = 'annotation-pin';
        pin.style.left = `${annotation.x}%`;
        pin.style.top = `${annotation.y}%`;
        pin.dataset.id = annotation.id;
        
        // Apply color if it exists in the annotation, otherwise use current color
        const pinColor = annotation.color || this.currentPinColor;
        pin.style.backgroundColor = pinColor;
        pin.dataset.color = pinColor;
        
        // Create comment box
        const comment = document.createElement('div');
        comment.className = 'annotation-comment';
        // Set border color to match pin color
        comment.style.border = `1.5px solid ${pinColor}`;
        
        // Create textarea
        const textarea = document.createElement('textarea');
        textarea.value = annotation.text || '';
        textarea.placeholder = 'Add a comment...';
        
        // Create text display
        const textDiv = document.createElement('div');
        textDiv.className = 'comment-text';
        textDiv.textContent = annotation.text || 'No comment';
        // Initially set display based on whether there is text
        textarea.style.display = annotation.text ? 'none' : 'block';
        textDiv.style.display = annotation.text ? 'block' : 'none';
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-annotation';
        deleteBtn.innerHTML = '&times;';
        
        // Assemble comment box
        comment.appendChild(textarea);
        comment.appendChild(textDiv);
        comment.appendChild(deleteBtn);
        pin.appendChild(comment);
        
        // Set up event handlers
        this.setupPinEventHandlers(pin, comment, textarea, textDiv, annotation);
        
        // Apply initial font size based on text content
        this.adjustFontSizeForComment(comment, annotation.text);

        // Add to DOM
        this.annotationsLayer.appendChild(pin);
        
        // Open comment box and focus textarea for new annotations (no initial text)
        if (!annotation.text) {
            setTimeout(() => {
                comment.classList.add('open');
                textarea.focus();
                 // Ensure display is correct when opening for new comment
                 textarea.style.display = 'block';
                 textDiv.style.display = 'none';
            }, 0);
        }
        
        // Remove 'active' from all pins
        document.querySelectorAll('.annotation-pin').forEach(p => p.classList.remove('active'));
        // Add 'active' to the current pin
        pin.classList.add('active');
        // Update pin opacities (new pin is active)
        this.updatePinOpacities(pin);
        
        // Prevent clicks inside the comment bubble from bubbling up to the annotation layer
        comment.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        comment.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        
        return pin;
    }

    /**
     * Set up event handlers for a pin and its comment box
     */
    setupPinEventHandlers(pin, comment, textarea, textDiv, annotation) {
        if (this.viewOnly) {
            // Disable editing/deleting in view-only mode
            textarea.setAttribute('readonly', 'readonly');
            textarea.setAttribute('tabindex', '-1');
            textarea.style.pointerEvents = 'none';
            textDiv.style.pointerEvents = 'none';
            comment.querySelector('.delete-annotation').style.display = 'none';
            return;
        }
        // Handle delete button
        comment.querySelector('.delete-annotation').addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteAnnotation(pin);
        });

        // Handle textarea changes
        textarea.addEventListener('input', () => {
            annotation.text = textarea.value;
            textDiv.textContent = textarea.value || 'No comment';
            // Check text length and adjust font size on input
            this.adjustFontSizeForComment(comment, textarea.value);
        });

        // Handle Enter key
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (textarea.value.trim()) {
                    textarea.style.display = 'none';
                    textDiv.style.display = 'block';
                    comment.classList.remove('open');
                    // Ensure font size is applied to textDiv after saving
                    this.adjustFontSizeForComment(comment, annotation.text); 
                    this.zoomOut(); // Automatically zoom out after commenting
                } else {
                    this.deleteAnnotation(pin);
                }
            } else if (e.key === 'Escape') { // Optional: Add escape key to close without saving
                 if (annotation.text.trim()) {
                     textarea.value = annotation.text;
                     textDiv.textContent = annotation.text;
                     textarea.style.display = 'none';
                     textDiv.style.display = 'block';
                     comment.classList.remove('open');
                      // Ensure font size is applied to textDiv after reverting
                     this.adjustFontSizeForComment(comment, annotation.text); 
                 } else {
                    // If escape on empty, delete
                     this.deleteAnnotation(pin);
                 }
            } else {
                 // Adjust font size while typing
                 this.adjustFontSizeForComment(comment, textarea.value); // Redundant, already in input? Keep for safety?
            }
        });

        // Handle textarea blur
        textarea.addEventListener('blur', (e) => {
            setTimeout(() => {
                const active = document.activeElement;
                if (!comment.contains(active) && !pin.contains(active)) {
                    if (textarea.value.trim()) {
                        textarea.style.display = 'none';
                        textDiv.style.display = 'block';
                        this.adjustFontSizeForComment(comment, annotation.text);
                        this.zoomOut();
                    } else {
                        this.deleteAnnotation(pin);
                    }
                }
                // If focus is still inside comment or pin, do nothing
            }, 0);
        });

        // Handle text div click
        textDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            comment.classList.add('open');
            textarea.style.display = 'block';
            textDiv.style.display = 'none';
            textarea.focus();
             // Ensure font size is applied to textarea when opening for edit
            this.adjustFontSizeForComment(comment, annotation.text); 
            // Remove 'active' from all pins
            document.querySelectorAll('.annotation-pin').forEach(p => p.classList.remove('active'));
            // Add 'active' to the current pin
            pin.classList.add('active');
        });

        // Apply initial font size based on existing text after setup
        // Moved this call to renderAnnotation for initial rendering
        // this.adjustFontSizeForComment(comment, annotation.text);

        // Set up dragging in move mode
        this.setupPinDragging(pin, annotation);
    }

    /**
     * Adjust font size of comment text based on length
     */
    adjustFontSizeForComment(commentElement, text) {
        const textLength = text.length;
        const threshold = 100; // Character length threshold
        const smallTextClass = 'small-text';

        if (textLength > threshold) {
            commentElement.classList.add(smallTextClass);
        } else {
            commentElement.classList.remove(smallTextClass);
        }
    }

    /**
     * Set up dragging functionality for a pin
     */
    setupPinDragging(pin, annotation) {
        let isDragging = false;
        let startPinX = 0;
        let startPinY = 0;
        let startMouseX = 0;
        let startMouseY = 0;

        pin.addEventListener('mousedown', (e) => {
            if (this.currentMode !== 'move') return;

            isDragging = true;
            startPinX = parseFloat(pin.style.left);
            startPinY = parseFloat(pin.style.top);
            startMouseX = e.clientX;
            startMouseY = e.clientY;

            pin.classList.add('dragging');

            e.preventDefault();
            e.stopPropagation();
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - startMouseX;
            const deltaY = e.clientY - startMouseY;

            const rect = this.annotationImage.getBoundingClientRect();
            // Use a scale of 1 for dragging calculations as the pin position is percentage relative to original image size
            const scale = 1; // this.imageAnnotationWrapper.classList.contains('zoomed') ? 3 : 1;

            const newX = startPinX + ((deltaX / rect.width) * 100);
            const newY = startPinY + ((deltaY / rect.height) * 100);

            pin.style.left = `${Math.max(0, Math.min(100, newX))}%`;
            pin.style.top = `${Math.max(0, Math.min(100, newY))}%`;

            annotation.x = parseFloat(pin.style.left);
            annotation.y = parseFloat(pin.style.top);
            // Removed: this.updateUrl(); // Don't update URL on every mouse move
        };

        const onMouseUp = () => {
            if (!isDragging) return;

            isDragging = false;
            pin.classList.remove('dragging');
            this.zoomOut(); // Update URL only when dragging stops
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    /**
     * Set up panning functionality for zoomed view
     */
    setupPanning() {
        // Mouse event handlers for desktop
        const handleMouseDown = (e) => {
            if (this.currentMode !== 'move' || !this.imageAnnotationWrapper.classList.contains('zoomed')) return;
            if (e.target.closest('.annotation-pin') || e.target.closest('.annotation-comment')) return;
            
            this.isPanning = true;
            this.hasPanned = false; // Reset hasPanned at the start of a potential pan/click
            this.startPanX = e.clientX;
            this.startPanY = e.clientY;
            
            this.imageAnnotationWrapper.classList.add('panning');
        };

        const handleMouseMove = (e) => {
            if (!this.isPanning) return;

            const deltaX = e.clientX - this.startPanX;
            const deltaY = e.clientY - this.startPanY;

            const moveThreshold = 5; // pixels to exceed before considering it a pan

            if (Math.abs(deltaX) > moveThreshold || Math.abs(deltaY) > moveThreshold) {
                this.hasPanned = true; // Mark that panning has occurred
            }

            this.currentTranslateX += deltaX;
            this.currentTranslateY += deltaY;

            this.startPanX = e.clientX;
            this.startPanY = e.clientY;

            this.applyPanTransform();
        };

        const handleMouseUp = () => {
            if (!this.isPanning) return;

            this.isPanning = false;
            this.imageAnnotationWrapper.classList.remove('panning');
            this.adjustCommentBoxPositions();
            // hasPanned remains true if panning occurred, will be checked in click handler
        };

        // Touch event handlers for mobile
        let isDraggingTouch = false; // Flag to track if the current touch sequence is a drag
        let touchStartX = 0; // Starting X position of touch
        let touchStartY = 0; // Starting Y position of touch

        const handleTouchStart = (e) => {
            if (e.touches.length === 1) { // Only handle single touch
                 if (this.currentMode !== 'move' || !this.imageAnnotationWrapper.classList.contains('zoomed')) return;
                 if (e.target.closest('.annotation-pin') || e.target.closest('.annotation-comment')) return;
                
                 // Prevent default touch behaviors like scrolling, but only if on the image/annotations area when zoomed
                 // This prevents preventing default scroll outside the image when zoomed out.
                 if (e.target === this.imageAnnotationWrapper || e.target === this.annotationsLayer) {
                      e.preventDefault(); 
                 }

                this.isPanning = false; // Assume not panning initially
                this.hasPanned = false; // Reset hasPanned for this sequence
                isDraggingTouch = false; // Reset drag flag
                touchStartX = e.touches[0].clientX; // Record start position
                touchStartY = e.touches[0].clientY;

                this.startPanX = touchStartX; // Initialize startPan for potential pan
                this.startPanY = touchStartY;
                // panning class added in touchmove if threshold exceeded
            }
        };

        const handleTouchMove = (e) => {
            if (e.touches.length !== 1) return;
            
            const deltaX = e.touches[0].clientX - touchStartX; // Calculate delta from touch start
            const deltaY = e.touches[0].clientY - touchStartY; // Calculate delta from touch start

             const moveThreshold = 10; // pixels to exceed before considering it a pan

            if (Math.abs(deltaX) > moveThreshold || Math.abs(deltaY) > moveThreshold) {
                isDraggingTouch = true; // Mark as a drag
                this.isPanning = true; // It's a pan
                this.hasPanned = true; // Mark that panning has occurred
                this.imageAnnotationWrapper.classList.add('panning'); // Add panning class on significant move
            }

            if (this.isPanning) {
                e.preventDefault(); // Prevent default scroll/zoom only when actually panning
                // Use deltas from the *previous* move for smooth panning
                const panDeltaX = e.touches[0].clientX - this.startPanX;
                const panDeltaY = e.touches[0].clientY - this.startPanY;

                this.currentTranslateX += panDeltaX;
                this.currentTranslateY += panDeltaY;

                this.startPanX = e.touches[0].clientX;
                this.startPanY = e.touches[0].clientY;

                this.applyPanTransform();
            }
        };

        const handleTouchEnd = (e) => {
            if (!isDraggingTouch) {
                 // If it was NOT a drag (i.e., a tap or very small movement)
                 // Check if image is zoomed and the tap was on the image background
                 if (this.imageAnnotationWrapper.classList.contains('zoomed') &&
                     (e.target === this.imageAnnotationWrapper || e.target === this.annotationsLayer)) {
                      console.log('Tap detected on image background, zooming out');
                      this.zoomOut();
                 }
            }
            
            // Reset panning state and class after any touch sequence ends
             if (this.isPanning) { // Only remove class if it was added
                 this.imageAnnotationWrapper.classList.remove('panning');
             }
            this.isPanning = false;
            // hasPanned is handled by touchmove and reset in touchstart
            this.adjustCommentBoxPositions(); // Adjust comment positions after touch end
            
            // Reset startPanX/Y and touchStartX/Y for the next interaction
            this.startPanX = 0;
            this.startPanY = 0;
            touchStartX = 0;
            touchStartY = 0;
        };

        // Mouse event listeners for desktop
        this.imageAnnotationWrapper.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        // Touch event listeners for mobile
        this.imageAnnotationWrapper.addEventListener('touchstart', handleTouchStart, { passive: false });
        this.imageAnnotationWrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
        // Add touchend listener to the imageAnnotationWrapper for reliable tap detection
        this.imageAnnotationWrapper.addEventListener('touchend', handleTouchEnd);

        // Prevent default context menu on image/annotations layer on touch devices
         this.annotationsLayer.addEventListener('contextmenu', (e) => {
              if (e.touches && e.touches.length > 0) { // Check if it's a touch event
                  e.preventDefault();
              }
         });

         // The click handler on annotationsLayer handles the zoom out logic for desktop clicks and taps that successfully trigger it after touch.
         // The touchend handler above provides a more reliable tap-to-zoom-out specifically for mobile after touch interactions.
    }

    /**
     * Pan to a specific pin
     */
    panToPin(pin) {
        if (!this.imageAnnotationWrapper || !pin) return;

        const scale = 3; // Keep the scale at 3x for zooming

        // Pin position as a percentage
        const pinXPercent = parseFloat(pin.style.left) / 100;
        const pinYPercent = parseFloat(pin.style.top) / 100;

        // Container and image dimensions (use rendered size, not natural size)
        const containerWidth = this.imageAnnotationWrapper.offsetWidth;
        const containerHeight = this.imageAnnotationWrapper.offsetHeight;
        const imageWidth = this.annotationImage.offsetWidth;
        const imageHeight = this.annotationImage.offsetHeight;

        // Scaled image size
        const scaledImageWidth = imageWidth * scale;
        const scaledImageHeight = imageHeight * scale;

        // Pin's position in the scaled image
        const pinScaledX = pinXPercent * scaledImageWidth;
        const pinScaledY = pinYPercent * scaledImageHeight;

        // Center the pin in the container
        const translateX = (containerWidth / 2) - pinScaledX;
        const translateY = (containerHeight / 2) - pinScaledY;

        this.currentTranslateX = translateX;
        this.currentTranslateY = translateY;

        // Always set transform-origin to top-left for correct math
        this.imageAnnotationWrapper.style.transformOrigin = '0 0';

        // If not already zoomed, add zoomed class
        if (!this.imageAnnotationWrapper.classList.contains('zoomed')) {
            this.imageAnnotationWrapper.classList.add('zoomed');
        }

        // Apply the transform with the new translation and scale
        this.applyPanTransform();

        // Set as active pin
        this.currentActivePin = pin;

        // Ensure the comment box is visible and positioned correctly
        const comment = pin.querySelector('.annotation-comment');
        if (comment) {
            comment.classList.add('open');
            this.adjustCommentBoxPositions(); // Adjust position relative to the new pin location
        }

        // Remove 'active' from all pins
        document.querySelectorAll('.annotation-pin').forEach(p => p.classList.remove('active'));
        // Add 'active' to the current pin
        pin.classList.add('active');
        // Update pin opacities
        this.updatePinOpacities(pin);
    }

    /**
     * Apply the current pan transform
     */
    applyPanTransform() {
        if (!this.imageAnnotationWrapper) return;
        const scale = this.imageAnnotationWrapper.classList.contains('zoomed') ? 3 : 1;

        // Calculate the maximum allowed translation based on the container and image size
        // The panned area should not go beyond the image boundaries at the current scale
        const maxTranslateX = (this.imageAnnotationWrapper.offsetWidth * scale - this.imageAnnotationWrapper.offsetWidth) / 2;
        const maxTranslateY = (this.imageAnnotationWrapper.offsetHeight * scale - this.imageAnnotationWrapper.offsetHeight) / 2;

        // Clamp the translation values to prevent going too far
        // Need to consider the transform origin. If origin is 0 0, clamping is different.
        // With origin 0 0, the image top-left is translated.
        // The image spans from (translateX, translateY) to (translateX + imageWidth*scale, translateY + imageHeight*scale)
        // The container is from (0,0) to (containerWidth, containerHeight)
        // We need: translateX <= 0 and translateY <= 0 (to not show space on left/top)
        // And: translateX + imageWidth*scale >= containerWidth and translateY + imageHeight*scale >= containerHeight
        // So: translateX >= containerWidth - imageWidth*scale and translateY >= containerHeight - imageHeight*scale

        const imageWidthScaled = this.annotationImage.offsetWidth * scale;
        const imageHeightScaled = this.annotationImage.offsetHeight * scale;
        const containerWidth = this.imageAnnotationWrapper.offsetWidth;
        const containerHeight = this.imageAnnotationWrapper.offsetHeight;

        const minTx = containerWidth - imageWidthScaled;
        const minTy = containerHeight - imageHeightScaled;
        const maxTx = 0; // Assuming transform origin 0 0, can't pan left/up beyond original position
        const maxTy = 0;

        const clampedTranslateX = Math.max(minTx, Math.min(maxTx, this.currentTranslateX));
        const clampedTranslateY = Math.max(minTy, Math.min(maxTy, this.currentTranslateY));

        this.imageAnnotationWrapper.style.transform = `translate(${clampedTranslateX}px, ${clampedTranslateY}px) scale(${scale})`;

        // Update current translation to clamped values
        this.currentTranslateX = clampedTranslateX;
        this.currentTranslateY = clampedTranslateY;

        // Adjust comment box positions after applying transform
        this.adjustCommentBoxPositions();
    }

    /**
     * Reset pan and zoom
     */
    zoomOut() {
        if (!this.imageAnnotationWrapper || !this.imageAnnotationWrapper.classList.contains('zoomed')) {
            // Already zoomed out
            this.setZoom(1); // Reset manual zoom
            return;
        }

        // Set the transition properties to ensure smooth animation back to default
        this.imageAnnotationWrapper.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform-origin 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
        
        // Set the target transform and origin for the zoomed out state
        this.imageAnnotationWrapper.style.transform = 'translate(0px, 0px) scale(1)';
        this.imageAnnotationWrapper.style.transformOrigin = 'center center'; // Or whatever the default zoomed-out origin should be

        // Use a timeout to allow the transition to start before removing the class
        setTimeout(() => {
            this.currentTranslateX = 0;
            this.currentTranslateY = 0;
            
            this.imageAnnotationWrapper.classList.remove('zoomed');
            this.currentActivePin = null;
            
            document.querySelectorAll('.annotation-comment.open').forEach(comment => {
                comment.classList.remove('open');
                 // Hide textarea and show text div
                const textarea = comment.querySelector('textarea');
                const textDiv = comment.querySelector('.comment-text');
                 if (textarea && textDiv) {
                     textarea.style.display = 'none';
                     textDiv.style.display = 'block';
                 }
            });
            // Remove 'active' and 'dragging' from all pins when zoomed out
            document.querySelectorAll('.annotation-pin').forEach(pin => {
                pin.classList.remove('active');
                pin.classList.remove('dragging');
            });
             // After transition, reset transition property to default from CSS for panning responsiveness
            // This is important because the 'panning' class sets transition to 'none'.
            // A brief timeout might be needed if the transition takes the full 500ms.
            // A more robust approach might involve listening for the 'transitionend' event.
             // For now, let's rely on the CSS transition definition being present and the `panning` class overriding it.
             this.imageAnnotationWrapper.style.transition = ''; // Revert to CSS defined transition
            // Update pin opacities (no active pin)
            this.updatePinOpacities(null);
            this.setZoom(1); // Reset manual zoom
        }, 500); // Match the transition duration
    }

    /**
     * Adjust comment box positions to ensure visibility
     */
    adjustCommentBoxPositions() {
        if (!this.annotationsLayer) return;
        
        const pins = this.annotationsLayer.querySelectorAll('.annotation-pin');
        pins.forEach(pin => {
            const comment = pin.querySelector('.annotation-comment');
            if (!comment || !comment.classList.contains('open')) return;
            
            const pinRect = pin.getBoundingClientRect();
            const commentRect = comment.getBoundingClientRect();
            const containerRect = this.imageAnnotationWrapper.getBoundingClientRect();
            
            // Remove existing positioning classes
            comment.classList.remove('opens-left', 'opens-right');

            // Vertical positioning is now handled entirely by CSS (top: 50%, transform: translateY(-50%))
            // comment.style.top = '50%'; // Removed
            
            // Determine which side to open based on space availability
            // Use pinRect.left + commentRect.width as an estimate, more accurate if we consider pin.style.left % and image size
            // However, for simplicity and to work with current structure, let's calculate based on viewport positions
            const estimatedRightEdge = pinRect.right + commentRect.width + 10; // Add a small buffer

            if (estimatedRightEdge > containerRect.right) {
                // Open to the left of the pin
                comment.classList.add('opens-left');
            } else {
                // Open to the right of the pin
                comment.classList.add('opens-right');
            }
            
            // Note: The horizontal positioning (left/right 100%) and transform (translate) are now managed purely by CSS
            // using the .opens-left and .opens-right classes, including the media query adjustments.
        });
    }

    /**
     * Handle image upload
     */
    handleImageUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageData = e.target.result;
            this.uploadedImageData = imageData; // Store image data in memory
            this.annotationImage.onload = () => {
                this.annotationImage.style.display = 'block';
                this.dropZone.style.display = 'none';
                this.imageAnnotationWrapper.style.display = 'block';
                this.annotationsLayer.style.display = 'block';
                this.toolbar.style.display = 'flex';
                if (this.topNav) this.topNav.style.display = 'block';
                this.imageAnnotationWrapper.classList.add('image-loaded');
            };
            this.annotationImage.onerror = () => {
                alert('Failed to load the image. Please try another one.');
            };
            this.annotationImage.src = imageData;
            this.annotations = [];
            this.annotationsLayer.innerHTML = '';
        };
        reader.onerror = () => {
            alert('Failed to read the image file. Please try again.');
        };
        reader.readAsDataURL(file);
    }

    /**
     * Delete an annotation
     */
    deleteAnnotation(pin) {
        const id = pin.dataset.id;
        pin.remove();
        
        const index = this.annotations.findIndex(a => a.id === id);
        if (index !== -1) {
            this.annotations.splice(index, 1);
        }
    }

    /**
     * Load annotations from URL
     */
    async loadFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('id');
        
        if (shareId) {
            try {
                const response = await fetch(`/.netlify/functions/share/${shareId}`);
                if (!response.ok) {
                    throw new Error('Share not found');
                }
                const { image, annotations } = await response.json();
                
                // Ensure we have valid image data
                if (!image) {
                    throw new Error('No image data found in share');
                }

                // Set the image data before setting the src
                this.uploadedImageData = image;
                this.annotationImage.src = image;
                
                // Wait for the image to load before proceeding
                await new Promise((resolve, reject) => {
                    this.annotationImage.onload = resolve;
                    this.annotationImage.onerror = reject;
                });

                // Show the UI elements
                this.annotationImage.style.display = 'block';
                this.dropZone.style.display = 'none';
                this.imageAnnotationWrapper.style.display = 'block';
                this.annotationsLayer.style.display = 'block';
                this.toolbar.style.display = 'flex';
                if (this.topNav) this.topNav.style.display = 'block';
                this.imageAnnotationWrapper.classList.add('image-loaded');

                // Load annotations
                this.annotations = annotations;
                annotations.forEach(annotation => this.renderAnnotation(annotation));

                // Show view-only badge
                const viewOnlyBadge = document.getElementById('viewOnlyBadge');
                if (viewOnlyBadge) {
                    viewOnlyBadge.style.display = 'block';
                }
            } catch (error) {
                console.error('Error loading share:', error);
                alert('Failed to load shared annotations. The link may have expired.');
            }
        }
        if (this.viewOnly && this.toolbar) {
            this.toolbar.style.display = 'none';
        }
    }

    /**
     * Reset the view to initial state
     */
    resetView() {
        // Hide app section, show landing section
        const landingSection = document.getElementById('landingSection');
        const appSection = document.getElementById('appSection');
        if (landingSection) landingSection.style.display = 'block';
        if (appSection) appSection.style.display = 'none';

        // Hide annotation UI elements
        if (this.annotationImage) this.annotationImage.style.display = 'none';
        if (this.dropZone) this.dropZone.style.display = 'flex';
        if (this.imageAnnotationWrapper) this.imageAnnotationWrapper.style.display = 'none';
        if (this.annotationsLayer) this.annotationsLayer.style.display = 'none';
        if (this.toolbar) this.toolbar.style.display = 'none';
        // Always show nav on landing view
        if (this.topNav) this.topNav.style.display = 'block';

        // Reset annotation state
        if (this.annotationImage) this.annotationImage.src = '';
        this.annotations = [];
        if (this.annotationsLayer) this.annotationsLayer.innerHTML = '';
        this.zoomOut();

        // Reset URL to base
        window.history.replaceState({}, '', window.location.pathname);
    }

    /**
     * Update pin opacities based on which pin is active
     */
    updatePinOpacities(activePin) {
        // Only apply dimming if zoomed in
        if (!this.imageAnnotationWrapper.classList.contains('zoomed')) {
            document.querySelectorAll('.annotation-pin').forEach(pin => {
                pin.classList.remove('dimmed');
            });
            return;
        }
        document.querySelectorAll('.annotation-pin').forEach(pin => {
            if (!activePin) {
                pin.classList.remove('dimmed');
            } else if (pin !== activePin) {
                pin.classList.add('dimmed');
            } else {
                pin.classList.remove('dimmed');
            }
        });
    }

    setupColorPickerHandlers() {
        const colorPickerMenu = document.getElementById('colorPickerMenu');
        const addColorBtn = document.getElementById('addColorBtn');
        const vanillaPickerPopup = this.vanillaPickerPopup;
        const annotationsLayer = document.getElementById('annotationsLayer');
        const imageAnnotationWrapper = document.querySelector('.image-annotation-wrapper');
        if (colorPickerMenu) {
            colorPickerMenu.style.zIndex = 3001;
            colorPickerMenu.style.pointerEvents = 'auto';
        }
        if (vanillaPickerPopup) {
            vanillaPickerPopup.style.zIndex = 3002;
            vanillaPickerPopup.style.pointerEvents = 'auto';
        }
        if (addColorBtn && vanillaPickerPopup && colorPickerMenu) {
            addColorBtn.onclick = null;
            addColorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
                addColorBtn.classList.add('active');
                const menuRect = colorPickerMenu.getBoundingClientRect();
                vanillaPickerPopup.style.display = 'block';
                vanillaPickerPopup.style.left = `${menuRect.left + menuRect.width/2 - 120}px`;
                vanillaPickerPopup.style.top = `${menuRect.top - 220}px`;
                if (annotationsLayer) annotationsLayer.style.pointerEvents = 'none';
                if (imageAnnotationWrapper) imageAnnotationWrapper.style.pointerEvents = 'none';
                const pickerColor = this.lastCustomColor || this.currentPinColor;
                if (!this.vanillaPicker) {
                    this.vanillaPicker = new window.Picker({
                        parent: vanillaPickerPopup,
                        popup: false,
                        alpha: false,
                        color: pickerColor,
                        editorFormat: 'hex',
                        onChange: (color) => {
                            const hex = color.hex;
                            this.currentPinColor = hex;
                            this.lastCustomColor = hex;
                            addColorBtn.style.backgroundColor = hex;
                        },
                        onDone: (color) => {
                            vanillaPickerPopup.style.display = 'none';
                            if (annotationsLayer) annotationsLayer.style.pointerEvents = '';
                            if (imageAnnotationWrapper) imageAnnotationWrapper.style.pointerEvents = '';
                        }
                    });
                } else {
                    this.vanillaPicker.setColor(pickerColor, true);
                    vanillaPickerPopup.style.display = 'block';
                }
            });
            // Hide the picker when a preset color is clicked
            document.querySelectorAll('.color-option').forEach(option => {
                if (!option.classList.contains('add-color-option')) {
                    option.addEventListener('click', () => {
                        vanillaPickerPopup.style.display = 'none';
                        if (annotationsLayer) annotationsLayer.style.pointerEvents = '';
                        if (imageAnnotationWrapper) imageAnnotationWrapper.style.pointerEvents = '';
                        document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
                        option.classList.add('active');
                        this.currentPinColor = option.dataset.color;
                    });
                }
            });
            // Hide the picker when clicking outside, but ignore clicks inside color picker or its popup
            document.addEventListener('mousedown', (e) => {
                const isInPickerMenu = e.target.closest('#colorPickerMenu');
                const isInPickerPopup = e.target.closest('#vanillaPickerPopup');
                const isAddColorBtn = e.target === addColorBtn;
                if (
                    vanillaPickerPopup.style.display === 'block' &&
                    !isInPickerMenu &&
                    !isInPickerPopup &&
                    !isAddColorBtn
                ) {
                    vanillaPickerPopup.style.display = 'none';
                    if (annotationsLayer) annotationsLayer.style.pointerEvents = '';
                    if (imageAnnotationWrapper) imageAnnotationWrapper.style.pointerEvents = '';
                }
            });
        }
    }

    setupZoomControls() {
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const zoomResetBtn = document.getElementById('zoomResetBtn');
        if (!zoomInBtn || !zoomOutBtn) return;
        zoomInBtn.addEventListener('click', () => this.setZoom(this.zoomLevel + this.zoomStep));
        zoomOutBtn.addEventListener('click', () => this.setZoom(this.zoomLevel - this.zoomStep));
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', () => this.setZoom(1));
        }
    }

    setZoom(zoom) {
        this.zoomLevel = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        if (this.imageAnnotationWrapper) {
            this.imageAnnotationWrapper.style.transform = `scale(${this.zoomLevel})`;
            this.imageAnnotationWrapper.style.transformOrigin = 'center center';
        }
    }
}

// Update the landing upload logic to initialize AnnotationTool only after switching to app view and loading the image
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOMContentLoaded: shareBtn is', document.getElementById('shareBtn'));
    const landingFileInput = document.getElementById('landingFileInput');
    const landingDropZone = document.getElementById('landingDropZone');
    const uploadButton = document.querySelector('.upload-button');

    // Function to handle file upload
    const handleFileUpload = (file) => {
        if (!file?.type.startsWith('image/')) {
            console.warn('File is not an image or missing.');
            return;
        }
        console.log('File selected:', file.name);
        const reader = new FileReader();
        reader.onload = (evt) => {
            const imageData = evt.target.result;
            // Hide landing, show app
            document.getElementById('landingSection').style.display = 'none';
            document.getElementById('appSection').style.display = 'block';
            console.log('App section shown.');

            // Get all necessary elements
            const annotationImage = document.getElementById('annotationImage');
            const imageAnnotationWrapper = document.querySelector('.image-annotation-wrapper');
            const toolbar = document.getElementById('toolbar');
            const topNav = document.getElementById('topNav');
            const annotationsLayer = document.getElementById('annotationsLayer');
            const dropZone = document.getElementById('dropZone');
            const appFileInput = document.getElementById('fileInput');
            const mainContainer = document.querySelector('.main-container');

            if (annotationImage && imageAnnotationWrapper && toolbar && topNav && annotationsLayer && dropZone && appFileInput && mainContainer) {
                // Initialize the annotation tool first
                window.annotationTool = new AnnotationTool();
                
                // Store the image data in the tool instance BEFORE setting the image source
                window.annotationTool.uploadedImageData = imageData;
                
                // Set up drag and drop handlers immediately
                dropZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    dropZone.classList.add('dragover');
                });
                dropZone.addEventListener('dragleave', () => {
                    dropZone.classList.remove('dragover');
                });
                dropZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    dropZone.classList.remove('dragover');
                    const file = e.dataTransfer.files[0];
                    if (file?.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const newImageData = e.target.result;
                            window.annotationTool.uploadedImageData = newImageData;
                            annotationImage.src = newImageData;
                        };
                        reader.readAsDataURL(file);
                    }
                });
                // Handle file input click
                dropZone.addEventListener('click', () => appFileInput.click());
                appFileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const newImageData = e.target.result;
                            window.annotationTool.uploadedImageData = newImageData;
                            annotationImage.src = newImageData;
                        };
                        reader.readAsDataURL(file);
                    }
                });
                // Set up the image load handler
                annotationImage.onload = function() {
                    // Show UI elements after image loads
                    dropZone.style.display = 'none';
                    annotationImage.style.display = 'block';
                    imageAnnotationWrapper.style.display = 'block';
                    mainContainer.style.display = 'block';
                    imageAnnotationWrapper.classList.add('image-loaded');
                    toolbar.style.display = 'flex';
                    if (topNav) topNav.style.display = 'block';
                    annotationsLayer.style.display = 'block';
                    console.log('Image loaded and UI shown.');
                    // Ensure the tool is in the correct initial state
                    window.annotationTool.setMode('move');
                };
                // Set the image source to trigger the load
                annotationImage.src = imageData;
                console.log('Image src set:', annotationImage.src);
            } else {
                // Detailed missing element log
                if (!annotationImage) console.error('Missing: annotationImage');
                if (!imageAnnotationWrapper) console.error('Missing: imageAnnotationWrapper');
                if (!toolbar) console.error('Missing: toolbar');
                if (!annotationsLayer) console.error('Missing: annotationsLayer');
                if (!dropZone) console.error('Missing: dropZone');
                if (!appFileInput) console.error('Missing: appFileInput');
                if (!mainContainer) console.error('Missing: mainContainer');
                if (!topNav) console.warn('Missing: topNav (not required to continue)');
                console.error('One or more required elements are missing.');
            }
        };
        reader.readAsDataURL(file);
    };

    // Set up landing page drag and drop
    if (landingDropZone) {
        const landingSection = document.getElementById('landingSection');
        landingDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            landingDropZone.classList.add('dragover');
            if (landingSection) landingSection.classList.add('drag-active');
        });
        landingDropZone.addEventListener('dragleave', () => {
            landingDropZone.classList.remove('dragover');
            if (landingSection) landingSection.classList.remove('drag-active');
        });
        landingDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            landingDropZone.classList.remove('dragover');
            if (landingSection) landingSection.classList.remove('drag-active');
            handleFileUpload(e.dataTransfer.files[0]);
        });
    }

    // Set up landing page file input
    if (uploadButton && landingFileInput) {
        uploadButton.addEventListener('click', function() {
            landingFileInput.click();
        });

        landingFileInput.addEventListener('change', function(e) {
            handleFileUpload(e.target.files[0]);
        });
    }
});

function updateCustomColor(btn) {
    // Set the color wheel as active
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    btn.classList.add('active');
    let color = '#' + btn.jscolor.toString();
    if (window.annotationTool) {
        window.annotationTool.currentPinColor = color;
        // If a preview pin is being placed, update its color in real time
        if (window.annotationTool.previewPin) {
            window.annotationTool.previewPin.style.backgroundColor = color;
        }
        if (window.annotationTool.previewComment) {
            window.annotationTool.previewComment.style.border = `1.5px solid ${color}`;
        }
    }
    btn.style.background = color;
}

// On page load, if URL has image or annotations, show app section and initialize tool in view-only mode
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const hasImage = urlParams.has('image');
    const hasAnnotations = urlParams.has('annotations');
    const hasId = urlParams.has('id');
    if (hasImage || hasAnnotations || hasId) {
        const landingSection = document.getElementById('landingSection');
        const appSection = document.getElementById('appSection');
        if (landingSection) landingSection.style.display = 'none';
        if (appSection) appSection.style.display = 'block';
        // Always force view-only mode for MVP
        window.annotationTool = new AnnotationTool();
    }
})(); 