// Get CSRF token from meta tag
function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize file upload form
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadFile();
        });
    }

    // Initialize delete modal
    const deleteModal = document.getElementById('deleteModal');
    if (deleteModal) {
        let fileIdToDelete = null;

        deleteModal.addEventListener('show.bs.modal', function(event) {
            const button = event.relatedTarget;
            fileIdToDelete = button.getAttribute('data-file-id');
            const filename = button.getAttribute('data-filename');
            document.getElementById('deleteFileName').textContent = filename;
        });

        document.getElementById('confirmDelete')?.addEventListener('click', function() {
            if (fileIdToDelete) {
                deleteFile(fileIdToDelete);
            }
        });
    }
});

function uploadFile() {
    const fileInput = document.querySelector('#uploadForm input[type="file"]');
    const categorySelect = document.querySelector('#uploadForm select[name="category"]');
    const progressContainer = document.querySelector('.upload-progress');
    const progressBar = document.querySelector('.upload-progress-bar');
    const progressText = document.querySelector('.upload-progress-text');
    const uploadModal = document.getElementById('uploadModal');
    const uploadButton = document.querySelector('.upload-btn');
    const form = document.getElementById('uploadForm');

    if (!fileInput || !fileInput.files.length) {
        alert('Please select a file first.');
        return;
    }

    // Show progress bar
    if (progressContainer) {
        progressContainer.style.display = 'block';
    }

    // Disable form elements during upload
    if (uploadButton) {
        uploadButton.disabled = true;
        uploadButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Uploading...';
    }
    fileInput.disabled = true;
    if (categorySelect) categorySelect.disabled = true;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('category', categorySelect ? categorySelect.value : 'other');
    formData.append('csrf_token', getCSRFToken());
    
    // Include selected tags
    const tagCheckboxes = document.querySelectorAll('#uploadForm input[name="tags"]:checked');
    tagCheckboxes.forEach(checkbox => {
        formData.append('tags', checkbox.value);
    });

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/files/upload', true);
    
    // Add CSRF token header
    const csrfToken = getCSRFToken();
    if (csrfToken) {
        xhr.setRequestHeader('X-CSRFToken', csrfToken);
    }

    xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
            const percent = (e.loaded / e.total) * 100;
            progressBar.style.width = percent + '%';
            progressText.textContent = Math.round(percent) + '%';
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            // Success case
            if (progressBar) {
                progressBar.classList.remove('bg-danger');
                progressBar.classList.add('bg-success');
                progressBar.style.width = '100%';
            }
            if (progressText) progressText.textContent = '100%';
            
            // Close modal and reset after delay
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(uploadModal);
                if (modal) modal.hide();
                
                // Reset form and progress
                if (form) form.reset();
                if (progressBar) {
                    progressBar.style.width = '0%';
                    progressBar.classList.remove('bg-success');
                }
                if (progressText) progressText.textContent = '0%';
                if (progressContainer) progressContainer.style.display = 'none';
                
                // Re-enable form elements
                if (uploadButton) {
                    uploadButton.disabled = false;
                    uploadButton.innerHTML = 'Upload';
                }
                if (fileInput) fileInput.disabled = false;
                if (categorySelect) categorySelect.disabled = false;
                
                // Refresh page to show new file
                window.location.reload();
            }, 500);
        } else {
            // Error case
            if (progressBar) progressBar.classList.add('bg-danger');
            let errorMsg = 'Upload failed';
            try {
                const response = JSON.parse(xhr.responseText);
                errorMsg = response.error || response.message || errorMsg;
            } catch (e) {
                errorMsg = xhr.responseText || errorMsg;
            }
            alert(errorMsg);
            
            // Re-enable form elements
            if (uploadButton) {
                uploadButton.disabled = false;
                uploadButton.innerHTML = 'Upload';
            }
            if (fileInput) fileInput.disabled = false;
            if (categorySelect) categorySelect.disabled = false;
        }
    };

    xhr.onerror = function() {
        if (progressBar) progressBar.classList.add('bg-danger');
        alert('Network error occurred. Please try again.');
        
        // Re-enable form elements
        if (uploadButton) {
            uploadButton.disabled = false;
            uploadButton.innerHTML = 'Upload';
        }
        if (fileInput) fileInput.disabled = false;
        if (categorySelect) categorySelect.disabled = false;
    };

    // Start upload
    xhr.send(formData);
}

function refreshFileList() {
    fetch('/files/list')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.text();
        })
        .then(html => {
            const fileList = document.getElementById('fileList');
            if (fileList) {
                fileList.innerHTML = html;
            }
        })
        .catch(error => {
            console.error('Error refreshing file list:', error);
            alert('Failed to refresh file list. Please reload the page.');
        });
}

function deleteFile(fileId) {
    const csrfToken = getCSRFToken();
    
    // Show loading state
    const confirmBtn = document.getElementById('confirmDelete');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Deleting...';
    }
    
    fetch(`/files/delete/${fileId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server error: ${response.status}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.message) {
            // Success case - close modal and reload page
            const modal = bootstrap.Modal.getInstance(document.getElementById('deleteModal'));
            if (modal) modal.hide();
            
            // Reload page to reflect changes
            window.location.reload();
        } else {
            throw new Error(data.error || 'Delete failed');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert(error.message || 'Delete failed. Please try again.');
        
        // Reset button
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = 'Delete';
        }
    });
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Update file tags
function updateFileTags(fileId, tagIds) {
    const csrfToken = getCSRFToken();
    const formData = new FormData();
    formData.append('csrf_token', csrfToken);
    tagIds.forEach(tagId => {
        formData.append('tags', tagId);
    });
    
    return fetch(`/files/tag/${fileId}`, {
        method: 'POST',
        headers: {
            'X-CSRFToken': csrfToken,
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw new Error(data.error || `Server error: ${response.status}`);
            });
        }
        return response.json();
    });
}

// Initialize tag modal
function initTagModal() {
    const tagModal = document.getElementById('tagModal');
    if (!tagModal) return;
    
    let currentFileId = null;
    
    tagModal.addEventListener('show.bs.modal', function(event) {
        const button = event.relatedTarget;
        currentFileId = button.getAttribute('data-file-id');
        const filename = button.getAttribute('data-filename');
        
        // Update modal title
        const modalTitle = tagModal.querySelector('.modal-title');
        if (modalTitle) {
            modalTitle.textContent = `Edit Tags: ${filename}`;
        }
        
        // Fetch current tags for the file
        fetch(`/files/get-tags/${currentFileId}`)
            .then(response => response.json())
            .then(data => {
                // Check the checkboxes for existing tags
                const checkboxes = tagModal.querySelectorAll('input[name="file_tags"]');
                checkboxes.forEach(checkbox => {
                    checkbox.checked = data.tags.includes(parseInt(checkbox.value));
                });
            })
            .catch(error => {
                console.error('Error fetching tags:', error);
            });
    });
    
    // Save tags button
    const saveTagsBtn = tagModal.querySelector('#saveTagsBtn');
    if (saveTagsBtn) {
        saveTagsBtn.addEventListener('click', function() {
            if (!currentFileId) return;
            
            const checkboxes = tagModal.querySelectorAll('input[name="file_tags"]:checked');
            const tagIds = Array.from(checkboxes).map(cb => cb.value);
            
            saveTagsBtn.disabled = true;
            saveTagsBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
            
            updateFileTags(currentFileId, tagIds)
                .then(data => {
                    const modal = bootstrap.Modal.getInstance(tagModal);
                    if (modal) modal.hide();
                    window.location.reload();
                })
                .catch(error => {
                    alert(error.message || 'Failed to update tags');
                })
                .finally(() => {
                    saveTagsBtn.disabled = false;
                    saveTagsBtn.innerHTML = 'Save Tags';
                });
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initTagModal();
}

