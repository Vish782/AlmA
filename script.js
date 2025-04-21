document.addEventListener('DOMContentLoaded', async function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const gallery = document.getElementById('gallery');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    const caption = document.getElementById('caption');
    const closeModal = document.getElementById('closeModal');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const storageInfo = document.getElementById('storageInfo');
    
    let db;
    let draggedItem = null;
    let currentImageIndex = 0;
    let galleryImages = [];
    
    // Initialize database and load gallery
    await initDB();
    await loadGallery();
    updateStorageInfo();
    
    // Event listeners
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    gallery.addEventListener('dragover', handleGalleryDragOver);
    saveBtn.addEventListener('click', saveGallery);
    clearBtn.addEventListener('click', clearGallery);
    closeModal.addEventListener('click', closeImageModal);
    prevBtn.addEventListener('click', showPrevImage);
    nextBtn.addEventListener('click', showNextImage);
    modal.addEventListener('click', handleModalClick);
    document.addEventListener('keydown', handleKeyDown);
    
    // Initialize IndexedDB
    async function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('ImageGalleryDB', 1);
            
            request.onerror = (event) => {
                console.error("Database error:", event.target.error);
                reject(event.target.error);
            };
            
            request.onupgradeneeded = (event) => {
                db = event.target.result;
                if (!db.objectStoreNames.contains('images')) {
                    db.createObjectStore('images', { keyPath: 'id' });
                }
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
        });
    }
    
    // Handle file selection
    async function handleFileSelect(e) {
        showLoading();
        try {
            await handleFiles(e.target.files);
            fileInput.value = '';
        } catch (error) {
            console.error("Erreur manutention des fichiers:", error);
        } finally {
            hideLoading();
        }
    }
    
    // Handle dropped files
    async function handleDrop(e) {
        e.preventDefault();
        uploadArea.style.backgroundColor = '#ecf0f1';
        uploadArea.style.borderColor = '#3498db';
        
        if (e.dataTransfer.files.length) {
            showLoading();
            try {
                await handleFiles(e.dataTransfer.files);
            } catch (error) {
                console.error("Erreur manutention des fichiers déposés:", error);
            } finally {
                hideLoading();
            }
        }
    }
    
    // Process uploaded files with compression
    async function handleFiles(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    const compressedImage = await compressImage(file);
                    addImageToGallery(compressedImage);
                    galleryImages.push(compressedImage);
                } catch (error) {
                    console.error('Error processing image:', error);
                }
            }
        }
        updateStorageInfo();
    }
    
    // Compress image before storage
    async function compressImage(file, { quality = 0.7, maxWidth = 1024 } = {}) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scale = Math.min(1, maxWidth / img.width);
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    
                    canvas.toBlob((blob) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(blob);
                        reader.onload = () => {
                            resolve({
                                src: reader.result,
                                name: file.name,
                                id: Date.now() + Math.random().toString(36).substr(2, 9),
                                size: blob.size,
                                lastModified: file.lastModified
                            });
                        };
                    }, 'image/jpeg', quality);
                };
            };
        });
    }
    
    // Add image to gallery DOM
    function addImageToGallery(imageData) {
        const galleryItem = document.createElement('div');
        galleryItem.className = 'gallery-item';
        galleryItem.draggable = true;
        galleryItem.dataset.id = imageData.id;
        
        galleryItem.innerHTML = `
            <img src="${imageData.src}" alt="${imageData.name}">
            <button class="delete-btn" title="Delete image"><i class="fas fa-trash"></i></button>
        `;
        
        // Drag events
        galleryItem.addEventListener('dragstart', () => {
            galleryItem.classList.add('dragging');
            draggedItem = galleryItem;
        });
        
        galleryItem.addEventListener('dragend', () => {
            galleryItem.classList.remove('dragging');
            draggedItem = null;
        });
        
        // Delete button
        galleryItem.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteImage(galleryItem.dataset.id);
        });
        
        // Fullscreen view
        galleryItem.querySelector('img').addEventListener('click', (e) => {
            const index = galleryImages.findIndex(img => img.id === galleryItem.dataset.id);
            openModal(index);
        });
        
        gallery.appendChild(galleryItem);
    }
    
    // Delete individual image
    async function deleteImage(imageId) {
        if (confirm('Voulez-vous vraiment suprimer cette image?')) {
            showLoading();
            try {
                // Remove from DOM
                const itemToRemove = document.querySelector(`.gallery-item[data-id="${imageId}"]`);
                if (itemToRemove) itemToRemove.remove();
                
                // Remove from array and database
                const index = galleryImages.findIndex(img => img.id === imageId);
                if (index !== -1) {
                    galleryImages.splice(index, 1);
                    
                    // Update currentImageIndex if viewing the deleted image
                    if (modal.style.display === 'block') {
                        if (galleryImages.length === 0) {
                            closeImageModal();
                        } else {
                            currentImageIndex = Math.min(currentImageIndex, galleryImages.length - 1);
                            openModal(currentImageIndex);
                        }
                    }
                    
                    // Update database
                    const transaction = db.transaction(['images'], 'readwrite');
                    const store = transaction.objectStore('images');
                    store.delete(imageId);
                }
                
                updateStorageInfo();
            } catch (error) {
                console.error('Erreur de supprétion de l image:', error);
            } finally {
                hideLoading();
            }
        }
    }
    
    // Save gallery to IndexedDB
    async function saveGallery() {
        showLoading();
        try {
            const transaction = db.transaction(['images'], 'readwrite');
            const store = transaction.objectStore('images');
            
            // Clear existing images
            await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = resolve;
                clearRequest.onerror = () => reject(clearRequest.error);
            });
            
            // Add all current images
            for (const image of galleryImages) {
                await new Promise((resolve, reject) => {
                    const putRequest = store.put(image);
                    putRequest.onsuccess = resolve;
                    putRequest.onerror = () => reject(putRequest.error);
                });
            }
            
            updateStorageInfo();
            alert('Gallerie sauvegarder avec succès!');
        } catch (error) {
            console.error('Erreur de sauvegarde de la gellerie:', error);
            alert('Erreur de sauvegarde de la gellerie: ' + error.message);
        } finally {
            hideLoading();
        }
    }
    
    // Load gallery from IndexedDB
    async function loadGallery() {
        showLoading();
        try {
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.getAll();
            
            galleryImages = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
            
            // Clear gallery and repopulate
            gallery.innerHTML = '';
            galleryImages.forEach(imageData => {
                addImageToGallery(imageData);
            });
            
            updateStorageInfo();
        } catch (error) {
            console.error('Erreur de chargement de la gallerie:', error);
        } finally {
            hideLoading();
        }
    }
    
    // Clear entire gallery
    async function clearGallery() {
        if (confirm('Voulez-vous vraiment tout suprimer? Cela ne peut pas être annuler.')) {
            showLoading();
            try {
                gallery.innerHTML = '';
                galleryImages = [];
                
                // Clear database
                const transaction = db.transaction(['images'], 'readwrite');
                const store = transaction.objectStore('images');
                await new Promise((resolve, reject) => {
                    const clearRequest = store.clear();
                    clearRequest.onsuccess = resolve;
                    clearRequest.onerror = () => reject(clearRequest.error);
                });
                
                if (modal.style.display === 'block') {
                    closeImageModal();
                }
                
                updateStorageInfo();
            } catch (error) {
                console.error('Erreur de nettoyage de la gallerie:', error);
            } finally {
                hideLoading();
            }
        }
    }
    
    // Fullscreen modal functions
    function openModal(index) {
        if (galleryImages.length === 0) return;
        
        currentImageIndex = index;
        const imgSrc = galleryImages[index].src;
        const imgName = galleryImages[index].name;
        
        modalImg.src = imgSrc;
        caption.textContent = imgName;
        modal.style.display = 'block';
    }
    
    function closeImageModal() {
        modal.style.display = 'none';
    }
    
    function showPrevImage() {
        currentImageIndex = (currentImageIndex - 1 + galleryImages.length) % galleryImages.length;
        openModal(currentImageIndex);
    }
    
    function showNextImage() {
        currentImageIndex = (currentImageIndex + 1) % galleryImages.length;
        openModal(currentImageIndex);
    }
    
    // Drag and drop helpers
    function handleDragOver(e) {
        e.preventDefault();
        uploadArea.style.backgroundColor = '#d6eaf8';
        uploadArea.style.borderColor = '#2980b9';
    }
    
    function handleDragLeave() {
        uploadArea.style.backgroundColor = '#ecf0f1';
        uploadArea.style.borderColor = '#3498db';
    }
    
    function handleGalleryDragOver(e) {
        e.preventDefault();
        const afterElement = getDragAfterElement(gallery, e.clientY);
        const draggable = document.querySelector('.dragging');
        
        if (afterElement == null) {
            gallery.appendChild(draggable);
        } else {
            gallery.insertBefore(draggable, afterElement);
        }
    }
    
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.gallery-item:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    // Event handlers
    function handleModalClick(e) {
        if (e.target === modal) {
            closeImageModal();
        }
    }
    
    function handleKeyDown(e) {
        if (modal.style.display === 'block') {
            if (e.key === 'ArrowLeft') {
                showPrevImage();
            } else if (e.key === 'ArrowRight') {
                showNextImage();
            } else if (e.key === 'Escape') {
                closeImageModal();
            }
        }
    }
    
    // UI helpers
    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }
    
    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }
    
    // Calculate and display storage usage
    async function updateStorageInfo() {
        try {
            if (!db) return;
            
            const transaction = db.transaction(['images'], 'readonly');
            const store = transaction.objectStore('images');
            const request = store.getAll();
            
            const images = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result || []);
                request.onerror = () => reject(request.error);
            });
            
            const totalBytes = images.reduce((sum, img) => sum + (img.size || 0), 0);
            const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
            
            // Get IndexedDB storage estimate
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                const usagePercent = estimate.quota ? (estimate.usage / estimate.quota * 100).toFixed(1) : 'N/A';
                
                storageInfo.textContent = `Stocage: ${totalMB}MB utilisé (${usagePercent}% de disponible)`;
                storageInfo.title = `Approxmativement ${totalMB}MB utilisé sur ${(estimate.quota / 1024 / 1024).toFixed(2)}MB available`;
            } else {
                storageInfo.textContent = `Stocage: ${totalMB}MB utilisé`;
            }
        } catch (error) {
            console.error('Erreur de calcule de stocage:', error);
            storageInfo.textContent = 'Stocage: Inconnue';
        }
    }
});