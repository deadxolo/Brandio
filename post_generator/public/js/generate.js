// Generate Posts Page Logic - Enhanced with proper image/text placeholder support

class PostGenerator {
  constructor() {
    const params = new URLSearchParams(window.location.search);
    // Support both 'template' and 'id' parameters
    this.templateId = params.get('template') || params.get('id');
    this.businessId = params.get('business') || 'default';
    this.isBulkMode = params.get('bulk') === 'true';

    this.template = null;
    this.placeholders = {};
    this.dataRows = [];
    this.currentRowIndex = 0;
    this.currentPreviewIndex = 0;

    // Image cache for dynamic images
    this.imageCache = new Map();
    this.loadingImages = new Set();

    this.canvas = document.getElementById('previewCanvas');
    this.ctx = this.canvas.getContext('2d');

    this.placeholderManager = new PlaceholderManager();

    // Auto-save settings
    this.autoSaveEnabled = true;
    this.autoSaveDelay = 1500; // 1.5 seconds
    this.autoSaveTimer = null;
    this.lastSavedAt = null;

    this.init();
  }

  // ==================== AUTO-SAVE ====================

  getStorageKey() {
    return `generate_data_${this.templateId}`;
  }

  saveToLocalStorage() {
    if (!this.autoSaveEnabled || !this.templateId) return;

    try {
      const data = {
        templateId: this.templateId,
        businessId: this.businessId,
        dataRows: this.dataRows,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(this.getStorageKey(), JSON.stringify(data));
      this.lastSavedAt = new Date();
      this.updateSaveIndicator('saved');
      console.log('Auto-saved generate data to localStorage');
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }

  loadFromLocalStorage() {
    if (!this.templateId) return false;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (!stored) return false;

      const data = JSON.parse(stored);
      if (data.templateId !== this.templateId) return false;

      // Only load if saved within last 24 hours
      const savedTime = new Date(data.savedAt);
      const hoursSinceSave = (Date.now() - savedTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSave > 24) {
        localStorage.removeItem(this.getStorageKey());
        return false;
      }

      if (data.dataRows && data.dataRows.length > 0) {
        this.dataRows = data.dataRows;
        this.showToast(`Restored ${this.dataRows.length} rows from previous session`, 'info');
        return true;
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
    }
    return false;
  }

  clearLocalStorage() {
    localStorage.removeItem(this.getStorageKey());
  }

  scheduleAutoSave() {
    if (!this.autoSaveEnabled) return;

    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.updateSaveIndicator('unsaved');

    this.autoSaveTimer = setTimeout(() => {
      this.saveToLocalStorage();
    }, this.autoSaveDelay);
  }

  updateSaveIndicator(status) {
    const indicator = document.getElementById('saveIndicator');
    if (!indicator) return;

    if (status === 'saved') {
      indicator.innerHTML = '<i class="fas fa-check-circle"></i> Saved';
      indicator.className = 'save-indicator saved';
    } else if (status === 'unsaved') {
      indicator.innerHTML = '<i class="fas fa-circle"></i> Unsaved';
      indicator.className = 'save-indicator unsaved';
    } else if (status === 'saving') {
      indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      indicator.className = 'save-indicator saving';
    }
  }

  async init() {
    if (!this.templateId) {
      this.showToast('No template specified', 'error');
      setTimeout(() => window.location.href = '/templates', 2000);
      return;
    }

    await this.loadTemplate();
    this.setupEventListeners();

    // Check for bulk data from home page
    if (this.isBulkMode) {
      this.loadBulkDataFromSession();
    } else {
      // Try to restore from localStorage first
      const restored = this.loadFromLocalStorage();
      if (restored) {
        this.renderRows();
        this.updateGenerateButton();
      } else {
        this.addEmptyRow();
      }
    }

    this.render();
  }

  loadBulkDataFromSession() {
    try {
      const bulkDataStr = sessionStorage.getItem('bulkGenerateData');
      if (!bulkDataStr) {
        this.showToast('No bulk data found. Please upload a file first.', 'error');
        this.addEmptyRow();
        return;
      }

      const bulkData = JSON.parse(bulkDataStr);

      // Verify template matches
      if (bulkData.templateId !== this.templateId) {
        this.showToast('Template mismatch. Please upload a file again.', 'error');
        this.addEmptyRow();
        return;
      }

      const { rows, mapping } = bulkData;

      if (!rows || rows.length === 0) {
        this.showToast('No data rows found in file.', 'error');
        this.addEmptyRow();
        return;
      }

      // Convert uploaded data rows using the mapping
      this.dataRows = rows.map(csvRow => {
        const row = this.placeholderManager.createEmptyRow(this.placeholders);

        // Apply mapping: mapping[placeholderName] = csvColumnName
        for (const [placeholderName, csvColumnName] of Object.entries(mapping)) {
          if (csvColumnName && csvRow[csvColumnName] !== undefined) {
            row[placeholderName] = csvRow[csvColumnName];
          }
        }

        return row;
      });

      // Clear session storage
      sessionStorage.removeItem('bulkGenerateData');

      this.showToast(`Loaded ${this.dataRows.length} rows from file`, 'success');
      this.renderRows();
      this.updateGenerateButton();
      this.updatePreview();

    } catch (error) {
      console.error('Failed to load bulk data:', error);
      this.showToast('Failed to load bulk data', 'error');
      this.addEmptyRow();
    }
  }

  async loadTemplate() {
    try {
      const res = await fetch(`/api/templates/item/${this.templateId}`);
      const data = await res.json();

      if (data.success && data.template) {
        this.template = data.template;
        this.placeholders = data.template.placeholders || {};

        // Update UI
        document.getElementById('templateName').textContent = this.template.name;
        document.getElementById('templateMeta').textContent =
          `${this.template.platform} - ${this.template.width}x${this.template.height}`;

        // Setup canvas dimensions
        this.canvas.width = this.template.width || 1080;
        this.canvas.height = this.template.height || 1080;

        // Load background image if needed
        if (this.template.background_type === 'image' && this.template.background_value) {
          let bgUrl = this.template.background_value;
          // Parse JSON if needed (new format stores as { url: "..." })
          if (typeof bgUrl === 'string') {
            try {
              const parsed = JSON.parse(bgUrl);
              if (parsed.url) {
                bgUrl = parsed.url;
              }
            } catch {
              // Not JSON, use as-is (legacy format or direct URL)
            }
          }
          await this.loadBackgroundImage(bgUrl);
        }

        // FIX: Normalize element positions before loading images
        if (this.template.elements) {
          this.normalizeElementPositions();
        }

        // Load element images
        if (this.template.elements) {
          for (const element of this.template.elements) {
            if (element.type === 'image' && element.src) {
              await this.loadElementImage(element);
            }
          }
        }

        this.render();
      } else {
        throw new Error('Template not found');
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      this.showToast('Failed to load template', 'error');
    }
  }

  // Normalize element positions to fix AI-generated positioning issues
  normalizeElementPositions() {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;

    // Skip aggressive normalization for manually edited or AI-controlled templates
    const isManuallyEdited = this.template.manuallyEdited === true;
    const isAIControlled = this.template.aiControlled === true;

    this.template.elements = this.template.elements.map(el => {
      // Flatten nested structures if present (always do this for compatibility)
      if (el.position && typeof el.position === 'object') {
        el.x = el.position.x;
        el.y = el.position.y;
        delete el.position;
      }
      if (el.size && typeof el.size === 'object') {
        el.width = el.size.width;
        el.height = el.size.height;
        delete el.size;
      }
      if (el.content && !el.text) {
        el.text = el.content;
        delete el.content;
      }
      if (el.typography && typeof el.typography === 'object') {
        Object.assign(el, el.typography);
        delete el.typography;
      }

      // Skip position normalization for manually edited, AI-controlled templates, or AI-controlled elements
      if (isManuallyEdited || isAIControlled || el.aiControlled) {
        return el;
      }

      // Ensure centered text uses canvas center (only for AI-generated templates)
      if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
        const expectedX = Math.round(canvasWidth / 2);
        if (Math.abs(el.x - expectedX) > 10) {
          el.x = expectedX;
        }
      }

      // Center shape elements that are frames
      if (el.type === 'shape' && (el.name?.includes('Frame') || el.id?.includes('frame'))) {
        const expectedX = Math.round(canvasWidth / 2);
        if (Math.abs(el.x - expectedX) > 50) {
          el.x = expectedX;
        }
        const frameMinY = 60 + ((el.height || 200) / 2);
        if (el.y < frameMinY) {
          el.y = Math.round(canvasHeight * 0.42);
        }
      }

      // Limit width to safe maximum
      const maxSafeWidth = canvasWidth - 120;
      if (el.width > maxSafeWidth) {
        el.width = maxSafeWidth;
      }

      // Ensure y position accounts for element height
      const padding = el.padding || 0;
      const elHeight = el.height || (el.fontSize ? el.fontSize * 1.5 : 50);
      const minY = 60 + (elHeight / 2) + padding;
      const maxY = canvasHeight - 60 - (elHeight / 2) - padding;
      if (el.y < minY) {
        el.y = minY;
      } else if (el.y > maxY) {
        el.y = maxY;
      }

      // Fix image elements
      if (el.type === 'image') {
        const expectedX = Math.round(canvasWidth / 2);
        if (Math.abs(el.x - expectedX) > 50) {
          el.x = expectedX;
        }
        if (!el.width || el.width < 50) el.width = 200;
        if (!el.height || el.height < 50) el.height = 200;

        // Ensure image Y position accounts for image height
        const imgMinY = 60 + (el.height / 2);
        const imgMaxY = canvasHeight - 60 - (el.height / 2);
        if (el.y < imgMinY) {
          el.y = imgMinY;
        } else if (el.y > imgMaxY) {
          el.y = imgMaxY;
        }

        // Person photos should be in center area
        if ((el.placeholderKey === 'person_photo' || el.id?.includes('person') || el.id?.includes('photo') || el.name?.includes('Person')) && !el.id?.includes('logo')) {
          const idealY = Math.round(canvasHeight * 0.42);
          if (el.y < canvasHeight * 0.3) {
            el.y = idealY;
          }
        }

        // Business logos should be in logo zone
        if (el.placeholderKey === 'business_logo' || el.id?.includes('logo')) {
          const idealLogoY = Math.round(canvasHeight * 0.72);
          if (el.y < canvasHeight * 0.5) {
            el.y = idealLogoY;
          }
        }
      }

      // Ensure business name has prominent font size (minimum 65px for 1080px canvas)
      if (el.placeholderKey === 'business_name' || el.id === 'business_name') {
        const minBusinessFontSize = Math.round(canvasWidth * 0.06);
        if (el.fontSize < minBusinessFontSize) {
          el.fontSize = minBusinessFontSize;
          el.fontSizePercent = 6;
        }
      }

      // Ensure person names are visible (minimum 54px for 1080px canvas)
      if (el.placeholderKey === 'person_name' || el.id?.includes('person_name')) {
        const minPersonFontSize = Math.round(canvasWidth * 0.05);
        if (el.fontSize < minPersonFontSize) {
          el.fontSize = minPersonFontSize;
          el.fontSizePercent = 5;
        }
      }

      // Ensure contact details are visible (minimum 27px for 1080px canvas)
      if (el.placeholderKey === 'phone' || el.placeholderKey === 'email' ||
          el.placeholderKey === 'website' || el.placeholderKey === 'address' ||
          el.placeholderKey === 'tagline' || el.placeholderKey === 'social' ||
          el.placeholderKey === 'facebook' || el.placeholderKey === 'instagram' ||
          el.placeholderKey === 'twitter' || el.placeholderKey === 'linkedin' ||
          el.id?.includes('phone') || el.id?.includes('email') ||
          el.id?.includes('website') || el.id?.includes('address') ||
          el.id?.includes('tagline') || el.id?.includes('social') ||
          el.id?.includes('facebook') || el.id?.includes('instagram') ||
          el.id?.includes('twitter') || el.id?.includes('linkedin')) {
        const minContactFontSize = Math.round(canvasWidth * 0.025);
        if (el.fontSize < minContactFontSize) {
          el.fontSize = minContactFontSize;
          el.fontSizePercent = 2.5;
        }
      }

      return el;
    });
  }

  loadBackgroundImage(src) {
    return new Promise((resolve) => {
      if (!src) {
        console.warn('No background image source provided');
        resolve();
        return;
      }

      console.log('Loading background image:', src.substring(0, 100) + '...');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        console.log('Background image loaded successfully');
        this.template.backgroundImage = img;
        resolve();
      };
      img.onerror = (e) => {
        console.error('Failed to load background image:', e);
        resolve();
      };
      img.src = src;
    });
  }

  loadElementImage(element) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        element.image = img;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = element.src;
    });
  }

  // Cache and load dynamic images
  async loadDynamicImage(src) {
    if (!src) return null;

    // Check cache
    if (this.imageCache.has(src)) {
      return this.imageCache.get(src);
    }

    // Check if already loading
    if (this.loadingImages.has(src)) {
      // Wait for it to load
      return new Promise((resolve) => {
        const checkLoaded = setInterval(() => {
          if (this.imageCache.has(src)) {
            clearInterval(checkLoaded);
            resolve(this.imageCache.get(src));
          }
        }, 50);
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkLoaded);
          resolve(null);
        }, 5000);
      });
    }

    this.loadingImages.add(src);

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(src, img);
        this.loadingImages.delete(src);
        resolve(img);
      };
      img.onerror = () => {
        this.loadingImages.delete(src);
        resolve(null);
      };
      img.src = src;
    });
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Form actions
    document.getElementById('addRowBtn')?.addEventListener('click', () => this.addEmptyRow());
    document.getElementById('clearAllBtn')?.addEventListener('click', () => this.clearAllRows());

    // CSV actions
    document.getElementById('csvDropzone')?.addEventListener('click', () => {
      document.getElementById('csvFileInput').click();
    });

    document.getElementById('csvFileInput')?.addEventListener('change', (e) => {
      this.handleCSVFile(e.target.files[0]);
    });

    document.getElementById('parseCSVBtn')?.addEventListener('click', () => {
      const text = document.getElementById('csvPasteInput').value;
      if (text) this.parseCSVData(text);
    });

    document.getElementById('applyMappingBtn')?.addEventListener('click', () => this.applyCSVMapping());

    // Drag and drop
    const dropzone = document.getElementById('csvDropzone');
    ['dragenter', 'dragover'].forEach(evt => {
      dropzone?.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropzone?.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (evt === 'drop' && e.dataTransfer?.files?.length) {
          this.handleCSVFile(e.dataTransfer.files[0]);
        }
      });
    });

    // Table actions
    document.getElementById('exportCSVBtn')?.addEventListener('click', () => this.exportCSV());

    // Preview navigation
    document.getElementById('prevPreview')?.addEventListener('click', () => this.navigatePreview(-1));
    document.getElementById('nextPreview')?.addEventListener('click', () => this.navigatePreview(1));

    // Header buttons
    document.getElementById('editTemplateBtn')?.addEventListener('click', () => {
      window.location.href = `/?id=${this.templateId}&business=${this.businessId}`;
    });

    document.getElementById('generateAllBtn')?.addEventListener('click', () => this.generateAllPosts());

    // Modal close
    document.querySelectorAll('.modal-backdrop, .modal-close, [data-dismiss="modal"]').forEach(el => {
      el.addEventListener('click', () => this.closeModals());
    });

    document.getElementById('saveRowBtn')?.addEventListener('click', () => this.saveRowFromModal());

    // Results modal
    document.getElementById('downloadAllBtn')?.addEventListener('click', () => this.downloadAllAsZip());
    document.getElementById('saveToPostsBtn')?.addEventListener('click', () => this.saveGeneratedPosts());
    document.getElementById('publishNowBtn')?.addEventListener('click', () => this.openPublishModal());

    // Publish modal
    document.getElementById('confirmPublishBtn')?.addEventListener('click', () => this.confirmPublish());
    document.getElementById('connectAccountBtn')?.addEventListener('click', () => this.openConnectAccountModal());
    document.getElementById('scheduleToggle')?.addEventListener('change', (e) => this.toggleSchedulePicker(e.target.checked));
    document.getElementById('publishCaption')?.addEventListener('input', (e) => this.updateCharCount(e.target.value));

    // Publishing progress modal
    document.getElementById('closePublishingBtn')?.addEventListener('click', () => this.closeModals());
    document.getElementById('retryFailedBtn')?.addEventListener('click', () => this.retryFailedPublishing());

    // Listen for OAuth popup messages
    window.addEventListener('message', (e) => this.handleOAuthMessage(e));
  }

  switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));

    if (tabId === 'table') {
      this.renderTable();
    }
  }

  // ==================== DATA ROWS ====================

  addEmptyRow() {
    const row = this.placeholderManager.createEmptyRow(this.placeholders);
    this.dataRows.push(row);
    this.renderRows();
    this.updateGenerateButton();

    // Auto-expand the new row
    this.currentRowIndex = this.dataRows.length - 1;
    this.updatePreview();
    this.scheduleAutoSave(); // Auto-save after adding row
  }

  clearAllRows() {
    if (this.dataRows.length === 0) return;

    if (confirm('Clear all data rows?')) {
      this.dataRows = [];
      this.clearLocalStorage(); // Clear saved data
      this.addEmptyRow();
    }
  }

  deleteRow(index) {
    if (this.dataRows.length <= 1) {
      this.showToast('Cannot delete the last row', 'warning');
      return;
    }

    this.dataRows.splice(index, 1);
    this.renderRows();
    this.updateGenerateButton();
    this.scheduleAutoSave(); // Auto-save after deleting row

    if (this.currentPreviewIndex >= this.dataRows.length) {
      this.currentPreviewIndex = this.dataRows.length - 1;
    }
    this.updatePreview();
  }

  editRow(index) {
    this.currentRowIndex = index;
    this.showRowModal(index);
  }

  showRowModal(index) {
    const row = this.dataRows[index];
    document.getElementById('rowModalIndex').textContent = `#${index + 1}`;

    const formHTML = this.generateEnhancedFormHTML(this.placeholders, row);
    document.getElementById('rowModalForm').innerHTML = formHTML;

    // Setup handlers
    this.setupImageUploads('#rowModalForm');
    this.setupColorSync('#rowModalForm');
    this.setupUrlInputHandlers('#rowModalForm');
    this.setupRealTimeSync('#rowModalForm'); // Real-time preview + auto-save

    document.getElementById('rowModal').classList.add('show');
  }

  // Setup real-time sync for preview updates and auto-save as user types
  setupRealTimeSync(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Listen for input changes on all form fields
    container.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('input', () => {
        // Update the current row data in real-time
        const form = document.getElementById('rowModalForm');
        const data = this.collectEnhancedFormData(form);
        this.dataRows[this.currentRowIndex] = data;

        // Update preview
        this.updatePreview();

        // Schedule auto-save
        this.scheduleAutoSave();
      });
    });
  }

  // Enhanced form HTML with better image/text handling
  generateEnhancedFormHTML(placeholders, values = {}) {
    if (Object.keys(placeholders).length === 0) {
      return '<p class="no-placeholders">No placeholders defined in this template</p>';
    }

    return Object.entries(placeholders).map(([name, config]) => {
      const value = values[name] || config.defaultValue || '';
      return this.generateEnhancedFieldHTML(name, config, value);
    }).join('');
  }

  generateEnhancedFieldHTML(name, config, value = '') {
    const type = config.type || 'text';
    const label = this.placeholderManager.formatLabel(name);
    const icon = this.placeholderManager.getTypeIcon(type);

    let inputHTML = '';

    switch (type) {
      case 'image':
        const hasValue = value && value.trim() !== '';
        const isBase64 = value && value.startsWith('data:');
        const displayValue = isBase64 ? '' : value;

        inputHTML = `
          <div class="image-field-container">
            <div class="image-input-group">
              <input type="text"
                     id="field_${name}"
                     name="${name}"
                     class="form-input image-url-input"
                     placeholder="Paste image URL or upload file..."
                     value="${this.escapeHtml(displayValue)}">
              <button type="button" class="btn-upload" data-field="${name}" title="Upload image">
                <i class="fas fa-upload"></i>
              </button>
              <button type="button" class="btn-paste" data-field="${name}" title="Paste from clipboard">
                <i class="fas fa-paste"></i>
              </button>
              <input type="file" id="file_${name}" accept="image/*" class="hidden" data-field="${name}">
            </div>
            <div class="image-preview ${hasValue ? '' : 'hidden'}" id="preview_${name}">
              <img src="${hasValue ? value : ''}" alt="Preview">
              <div class="image-preview-actions">
                <button type="button" class="btn-crop" data-field="${name}" title="Crop image">
                  <i class="fas fa-crop-alt"></i>
                </button>
                <button type="button" class="btn-view-full" data-field="${name}" title="View full size">
                  <i class="fas fa-expand"></i>
                </button>
                <button type="button" class="btn-remove-preview" data-field="${name}" title="Remove image">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
            <input type="hidden" id="field_${name}_data" name="${name}_data" value="${this.escapeHtml(value)}">
          </div>
        `;
        break;

      case 'color':
        inputHTML = `
          <div class="color-input-group">
            <input type="color" id="field_${name}" name="${name}" class="form-color" value="${value || '#ffffff'}">
            <input type="text" id="field_${name}_text" class="form-input color-text" value="${value || '#ffffff'}" pattern="^#[0-9A-Fa-f]{6}$">
          </div>
        `;
        break;

      case 'number':
        inputHTML = `
          <input type="number" id="field_${name}" name="${name}" class="form-input" value="${value}" step="any">
        `;
        break;

      default: // text
        inputHTML = `
          <textarea id="field_${name}" name="${name}" class="form-textarea" rows="2" placeholder="Enter ${label}...">${this.escapeHtml(value)}</textarea>
        `;
    }

    return `
      <div class="form-field" data-name="${name}" data-type="${type}">
        <label for="field_${name}">
          <i class="fas fa-${icon}"></i>
          <span>${label}</span>
          <span class="field-type-badge">${this.placeholderManager.getTypeLabel(type)}</span>
        </label>
        ${inputHTML}
      </div>
    `;
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupImageUploads(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Upload button click
    container.querySelectorAll('.btn-upload').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        document.getElementById(`file_${field}`).click();
      });
    });

    // Paste button click
    container.querySelectorAll('.btn-paste').forEach(btn => {
      btn.addEventListener('click', async () => {
        const field = btn.dataset.field;
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            for (const type of item.types) {
              if (type.startsWith('image/')) {
                const blob = await item.getType(type);
                this.handleImageBlob(blob, field, containerSelector);
                return;
              }
            }
          }
          this.showToast('No image found in clipboard', 'warning');
        } catch (err) {
          this.showToast('Could not access clipboard', 'error');
        }
      });
    });

    // File input change
    container.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const field = input.dataset.field;
        if (file) {
          this.handleImageFile(file, field, containerSelector);
        }
      });
    });

    // URL input change (with debounce)
    container.querySelectorAll('.image-url-input').forEach(input => {
      let debounceTimer;
      input.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const field = input.id.replace('field_', '');
          this.handleImageUrl(e.target.value, field, containerSelector);
        }, 500);
      });
    });

    // Remove preview button
    container.querySelectorAll('.btn-remove-preview').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        this.clearImageField(field, containerSelector);
      });
    });

    // View full size button
    container.querySelectorAll('.btn-view-full').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const preview = document.getElementById(`preview_${field}`);
        const img = preview?.querySelector('img');
        if (img?.src) {
          window.open(img.src, '_blank');
        }
      });
    });

    // Crop button
    container.querySelectorAll('.btn-crop').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const dataInput = container.querySelector(`#field_${field}_data`);
        const imageSrc = dataInput?.value;
        if (imageSrc) {
          this.openCropModal(imageSrc, field, containerSelector);
        }
      });
    });
  }

  setupUrlInputHandlers(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    // Allow pasting images directly into URL fields
    container.querySelectorAll('.image-url-input').forEach(input => {
      input.addEventListener('paste', async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault();
            const blob = item.getAsFile();
            const field = input.id.replace('field_', '');
            this.handleImageBlob(blob, field, containerSelector);
            return;
          }
        }
      });
    });
  }

  handleImageFile(file, field, containerSelector) {
    if (!file.type.startsWith('image/')) {
      this.showToast('Please select an image file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.setImagePreview(field, e.target.result, containerSelector);
    };
    reader.readAsDataURL(file);
  }

  handleImageBlob(blob, field, containerSelector) {
    const reader = new FileReader();
    reader.onload = (e) => {
      this.setImagePreview(field, e.target.result, containerSelector);
    };
    reader.readAsDataURL(blob);
  }

  async handleImageUrl(url, field, containerSelector) {
    if (!url || url.trim() === '') {
      this.clearImageField(field, containerSelector);
      return;
    }

    // Check if it's a valid URL
    try {
      new URL(url);
    } catch {
      return; // Not a valid URL yet
    }

    // Try to load the image
    const container = document.querySelector(containerSelector);
    const preview = container?.querySelector(`#preview_${field}`);
    const previewImg = preview?.querySelector('img');
    const dataInput = container?.querySelector(`#field_${field}_data`);

    // Show loading state
    if (preview) {
      preview.classList.remove('hidden');
      preview.classList.add('loading');
    }

    const img = await this.loadDynamicImage(url);

    if (img) {
      if (previewImg) previewImg.src = url;
      if (dataInput) dataInput.value = url;
      if (preview) {
        preview.classList.remove('loading');
      }
    } else {
      if (preview) {
        preview.classList.add('hidden');
        preview.classList.remove('loading');
      }
    }
  }

  setImagePreview(field, dataUrl, containerSelector) {
    const container = document.querySelector(containerSelector);
    const urlInput = container?.querySelector(`#field_${field}`);
    const dataInput = container?.querySelector(`#field_${field}_data`);
    const preview = container?.querySelector(`#preview_${field}`);
    const previewImg = preview?.querySelector('img');

    if (urlInput) urlInput.value = '';
    if (dataInput) dataInput.value = dataUrl;
    if (previewImg) previewImg.src = dataUrl;
    if (preview) preview.classList.remove('hidden');
  }

  clearImageField(field, containerSelector) {
    const container = document.querySelector(containerSelector);
    const urlInput = container?.querySelector(`#field_${field}`);
    const dataInput = container?.querySelector(`#field_${field}_data`);
    const preview = container?.querySelector(`#preview_${field}`);
    const previewImg = preview?.querySelector('img');
    const fileInput = container?.querySelector(`#file_${field}`);

    if (urlInput) urlInput.value = '';
    if (dataInput) dataInput.value = '';
    if (previewImg) previewImg.src = '';
    if (preview) preview.classList.add('hidden');
    if (fileInput) fileInput.value = '';
  }

  setupColorSync(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.querySelectorAll('.form-color').forEach(colorInput => {
      const field = colorInput.name;
      const textInput = document.getElementById(`field_${field}_text`);

      colorInput.addEventListener('input', () => {
        if (textInput) textInput.value = colorInput.value;
      });

      if (textInput) {
        textInput.addEventListener('input', () => {
          if (/^#[0-9A-Fa-f]{6}$/.test(textInput.value)) {
            colorInput.value = textInput.value;
          }
        });
      }
    });
  }

  saveRowFromModal() {
    const form = document.getElementById('rowModalForm');
    const data = this.collectEnhancedFormData(form);

    this.dataRows[this.currentRowIndex] = data;
    this.closeModals();
    this.renderRows();
    this.updateGenerateButton();
    this.updatePreview();
    this.scheduleAutoSave(); // Auto-save after row changes
    this.showToast('Row saved', 'success');
  }

  collectEnhancedFormData(formElement) {
    const data = {};
    const fields = formElement.querySelectorAll('.form-field');

    fields.forEach(field => {
      const name = field.dataset.name;
      const type = field.dataset.type;

      if (type === 'color') {
        data[name] = field.querySelector('.form-color').value;
      } else if (type === 'image') {
        // For images, prefer the data input (base64 or URL)
        const dataInput = field.querySelector(`[name="${name}_data"]`);
        const urlInput = field.querySelector('.image-url-input');
        data[name] = dataInput?.value || urlInput?.value || '';
      } else {
        const input = field.querySelector('.form-input, .form-textarea');
        data[name] = input?.value || '';
      }
    });

    return data;
  }

  renderRows() {
    const container = document.getElementById('rowsContainer');
    if (Object.keys(this.placeholders).length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-link" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
          <h3>No Placeholders</h3>
          <p>This template has no dynamic placeholders. Add placeholders in the editor first.</p>
          <button class="btn btn-primary" onclick="window.location.href='/?id=${this.templateId}&business=${this.businessId}'">
            <i class="fas fa-pen"></i> Edit Template
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.dataRows.map((row, index) => {
      const fields = Object.entries(this.placeholders).map(([name, config]) => {
        const value = row[name] || config.defaultValue || '';
        const type = config.type || 'text';
        const icon = this.placeholderManager.getTypeIcon(type);

        let valueDisplay = '';
        if (type === 'image' && value) {
          valueDisplay = `
            <div class="row-image-preview">
              <img src="${value}" alt="${name}" onerror="this.parentElement.innerHTML='<span class=\\'error-img\\'>Failed to load</span>'">
              <button class="row-crop-btn" onclick="event.stopPropagation(); generator.cropRowImage(${index}, '${name}')" title="Crop">
                <i class="fas fa-crop-alt"></i>
              </button>
            </div>
          `;
        } else if (type === 'color' && value) {
          valueDisplay = `
            <span class="color-chip" style="background: ${value};"></span>
            <span class="color-value">${value}</span>
          `;
        } else {
          const displayText = value ? this.truncateText(value, 40) : 'Empty';
          valueDisplay = `<span class="${value ? 'text-value' : 'empty-value'}">${this.escapeHtml(displayText)}</span>`;
        }

        return `
          <div class="row-field" data-type="${type}">
            <i class="fas fa-${icon}"></i>
            <span class="field-label">${this.placeholderManager.formatLabel(name)}:</span>
            <div class="field-value">${valueDisplay}</div>
          </div>
        `;
      }).join('');

      const hasData = Object.keys(this.placeholders).some(name => {
        const value = row[name];
        return value && value.trim && value.trim() !== '';
      });

      return `
        <div class="data-row ${index === this.currentPreviewIndex ? 'active' : ''} ${hasData ? 'has-data' : ''}" data-index="${index}">
          <div class="row-header" onclick="generator.selectRow(${index})">
            <span class="row-number">Row ${index + 1}</span>
            ${hasData ? '<span class="row-status"><i class="fas fa-check-circle"></i></span>' : ''}
            <div class="row-actions">
              <button onclick="event.stopPropagation(); generator.editRow(${index})" title="Edit">
                <i class="fas fa-pen"></i>
              </button>
              <button class="delete" onclick="event.stopPropagation(); generator.deleteRow(${index})" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="row-content">
            ${fields}
          </div>
        </div>
      `;
    }).join('');
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  selectRow(index) {
    this.currentPreviewIndex = index;
    this.updatePreview();
    this.renderRows();
  }

  // Crop image directly from row card
  cropRowImage(rowIndex, fieldName) {
    const row = this.dataRows[rowIndex];
    const imageSrc = row[fieldName];

    if (!imageSrc) {
      this.showToast('No image to crop', 'warning');
      return;
    }

    // Store row info for applying crop later
    this.cropRowIndex = rowIndex;
    this.cropFieldName = fieldName;

    this.openCropModalForRow(imageSrc);
  }

  openCropModalForRow(imageSrc) {
    this.cropAspectRatio = null;
    this.cropRotation = 0;

    const cropCanvas = document.getElementById('cropCanvas');
    const ctx = cropCanvas.getContext('2d');

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.cropImage = img;

      const maxWidth = 600;
      const maxHeight = 400;
      let displayWidth = img.width;
      let displayHeight = img.height;

      if (displayWidth > maxWidth) {
        displayHeight = (maxWidth / displayWidth) * displayHeight;
        displayWidth = maxWidth;
      }
      if (displayHeight > maxHeight) {
        displayWidth = (maxHeight / displayHeight) * displayWidth;
        displayHeight = maxHeight;
      }

      this.cropDisplayScale = displayWidth / img.width;

      cropCanvas.width = displayWidth;
      cropCanvas.height = displayHeight;
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      this.initCropSelection(displayWidth, displayHeight);
      this.setupCropModalEventsForRow();

      document.getElementById('cropModal').classList.add('show');
    };
    img.onerror = () => {
      this.showToast('Failed to load image for cropping', 'error');
    };
    img.src = imageSrc;
  }

  setupCropModalEventsForRow() {
    const selection = document.getElementById('cropSelection');
    const cropCanvas = document.getElementById('cropCanvas');

    selection.onmousedown = null;
    document.onmousemove = null;
    document.onmouseup = null;

    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let startX, startY, startSelection;

    selection.onmousedown = (e) => {
      if (e.target.classList.contains('crop-handle')) {
        isResizing = true;
        resizeHandle = e.target.dataset.handle;
      } else {
        isDragging = true;
      }
      startX = e.clientX;
      startY = e.clientY;
      startSelection = { ...this.cropSelection };
      e.preventDefault();
    };

    document.onmousemove = (e) => {
      if (!isDragging && !isResizing) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (isDragging) {
        let newX = startSelection.x + dx;
        let newY = startSelection.y + dy;
        newX = Math.max(0, Math.min(newX, cropCanvas.width - this.cropSelection.width));
        newY = Math.max(0, Math.min(newY, cropCanvas.height - this.cropSelection.height));
        this.cropSelection.x = newX;
        this.cropSelection.y = newY;
      } else if (isResizing) {
        this.handleCropResize(resizeHandle, dx, dy, startSelection, cropCanvas.width, cropCanvas.height);
      }

      this.updateCropSelectionUI();
    };

    document.onmouseup = () => {
      isDragging = false;
      isResizing = false;
      resizeHandle = null;
    };

    document.querySelectorAll('.aspect-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const aspect = btn.dataset.aspect;
        if (aspect === 'free') {
          this.cropAspectRatio = null;
        } else {
          const [w, h] = aspect.split(':').map(Number);
          this.cropAspectRatio = w / h;
          this.applyAspectRatio();
        }
      };
    });

    document.getElementById('resetCropBtn').onclick = () => {
      this.cropRotation = 0;
      this.initCropSelection(cropCanvas.width, cropCanvas.height);
      this.redrawCropCanvas();
    };

    document.getElementById('rotateCropBtn').onclick = () => {
      this.cropRotation = (this.cropRotation + 90) % 360;
      this.redrawCropCanvas();
    };

    // Apply crop for row
    document.getElementById('applyCropBtn').onclick = () => {
      this.applyCropForRow();
    };
  }

  applyCropForRow() {
    const { x, y, width, height } = this.cropSelection;
    const scale = 1 / this.cropDisplayScale;

    const outputCanvas = document.createElement('canvas');
    const outputCtx = outputCanvas.getContext('2d');

    const srcX = x * scale;
    const srcY = y * scale;
    const srcWidth = width * scale;
    const srcHeight = height * scale;

    outputCanvas.width = srcWidth;
    outputCanvas.height = srcHeight;

    if (this.cropRotation !== 0) {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = this.cropImage.width;
      tempCanvas.height = this.cropImage.height;

      tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      tempCtx.rotate((this.cropRotation * Math.PI) / 180);
      tempCtx.translate(-tempCanvas.width / 2, -tempCanvas.height / 2);
      tempCtx.drawImage(this.cropImage, 0, 0);

      outputCtx.drawImage(tempCanvas, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);
    } else {
      outputCtx.drawImage(this.cropImage, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);
    }

    const croppedDataUrl = outputCanvas.toDataURL('image/png');

    // Update the row data directly
    this.dataRows[this.cropRowIndex][this.cropFieldName] = croppedDataUrl;

    // Re-render
    this.renderRows();
    this.updatePreview();
    this.updateGenerateButton();

    document.getElementById('cropModal').classList.remove('show');
    this.showToast('Image cropped successfully', 'success');
  }

  // ==================== CSV HANDLING ====================

  handleCSVFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.parseCSVData(e.target.result);
    };
    reader.readAsText(file);
  }

  parseCSVData(text) {
    const result = this.placeholderManager.parseCSV(text);

    if (!result.success) {
      this.showToast(result.error, 'error');
      return;
    }

    this.csvData = result;

    // Show mapping interface
    const { mapping, unmapped } = this.placeholderManager.mapCSVToPlaceholders(result.headers, this.placeholders);

    const mappingHTML = result.headers.map(header => {
      const placeholderNames = Object.keys(this.placeholders);
      const selectedPlaceholder = mapping[header] || '';

      // Determine the type of the matched placeholder
      const placeholderType = selectedPlaceholder ? (this.placeholders[selectedPlaceholder]?.type || 'text') : '';
      const typeIcon = this.placeholderManager.getTypeIcon(placeholderType);

      return `
        <div class="mapping-row">
          <span class="csv-column">${header}</span>
          <i class="fas fa-arrow-right"></i>
          <select data-csv-column="${header}">
            <option value="">-- Skip --</option>
            ${placeholderNames.map(name => {
              const type = this.placeholders[name]?.type || 'text';
              const icon = this.placeholderManager.getTypeIcon(type);
              return `
                <option value="${name}" ${name === selectedPlaceholder ? 'selected' : ''}>
                  ${this.placeholderManager.formatLabel(name)} (${this.placeholderManager.getTypeLabel(type)})
                </option>
              `;
            }).join('')}
          </select>
        </div>
      `;
    }).join('');

    document.getElementById('mappingFields').innerHTML = mappingHTML;
    document.getElementById('csvMapping').classList.remove('hidden');

    // Show preview of first few rows
    this.showCSVPreview(result.rows.slice(0, 3));

    this.showToast(`Found ${result.rows.length} rows in CSV`, 'success');
  }

  showCSVPreview(rows) {
    // Could add a preview section here
    console.log('CSV Preview:', rows);
  }

  applyCSVMapping() {
    if (!this.csvData) return;

    const mapping = {};
    document.querySelectorAll('#mappingFields select').forEach(select => {
      const csvColumn = select.dataset.csvColumn;
      const placeholder = select.value;
      if (placeholder) {
        mapping[csvColumn] = placeholder;
      }
    });

    // Apply mapping to data
    const newRows = this.csvData.rows.map(csvRow => {
      const row = this.placeholderManager.createEmptyRow(this.placeholders);
      for (const [csvColumn, placeholder] of Object.entries(mapping)) {
        if (csvRow[csvColumn] !== undefined) {
          // For image placeholders, validate if it looks like a URL
          const type = this.placeholders[placeholder]?.type;
          let value = csvRow[csvColumn];

          if (type === 'image' && value) {
            // Check if it's a valid URL
            try {
              new URL(value);
            } catch {
              // Not a valid URL, might be a relative path or invalid
              console.warn(`Invalid image URL for ${placeholder}: ${value}`);
            }
          }

          row[placeholder] = value;
        }
      }
      return row;
    });

    this.dataRows = newRows;
    this.renderRows();
    this.updateGenerateButton();
    this.switchTab('form');

    document.getElementById('csvMapping').classList.add('hidden');
    document.getElementById('csvPasteInput').value = '';
    this.csvData = null;

    this.showToast(`Imported ${newRows.length} rows`, 'success');
    this.updatePreview();
  }

  // ==================== TABLE VIEW ====================

  renderTable() {
    const headers = document.getElementById('tableHeaders');
    const body = document.getElementById('tableBody');

    const placeholderNames = Object.keys(this.placeholders);

    headers.innerHTML = `
      <th>#</th>
      ${placeholderNames.map(name => {
        const type = this.placeholders[name]?.type || 'text';
        const icon = this.placeholderManager.getTypeIcon(type);
        return `<th><i class="fas fa-${icon}"></i> ${this.placeholderManager.formatLabel(name)}</th>`;
      }).join('')}
      <th>Actions</th>
    `;

    body.innerHTML = this.dataRows.map((row, index) => {
      return this.generateTableRowHTML(index, row, this.placeholders);
    }).join('');

    // Add event listeners
    body.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => this.editRow(parseInt(btn.dataset.row)));
    });

    body.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteRow(parseInt(btn.dataset.row)));
    });
  }

  generateTableRowHTML(rowIndex, data, placeholders) {
    const fields = Object.entries(placeholders).map(([name, config]) => {
      const value = data[name] || config.defaultValue || '';
      const type = config.type || 'text';

      if (type === 'image' && value) {
        return `
          <td class="cell-image">
            <img src="${value}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
            <span class="error-img" style="display:none;">Invalid</span>
          </td>
        `;
      } else if (type === 'color') {
        return `
          <td class="cell-color">
            <span class="color-chip" style="background:${value || '#ccc'}"></span>
            ${value || '-'}
          </td>
        `;
      } else {
        return `<td class="cell-text">${this.escapeHtml(this.truncateText(value, 30)) || '-'}</td>`;
      }
    }).join('');

    return `
      <tr data-row="${rowIndex}" class="${this.currentPreviewIndex === rowIndex ? 'active' : ''}">
        <td class="row-number">${rowIndex + 1}</td>
        ${fields}
        <td class="row-actions">
          <button type="button" class="btn-icon" data-action="edit" data-row="${rowIndex}" title="Edit">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="btn-icon" data-action="delete" data-row="${rowIndex}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }

  exportCSV() {
    const content = this.placeholderManager.exportToCSV(this.dataRows, this.placeholders);
    this.placeholderManager.downloadCSV(content, `${this.template.name}_data.csv`);
    this.showToast('CSV exported', 'success');
  }

  // ==================== PREVIEW ====================

  async updatePreview() {
    if (this.dataRows.length === 0) {
      document.getElementById('previewStatus').textContent = 'Add data to see preview';
      // Still draw the static template design (background, text, shapes) so the
      // canvas isn't blank — important for templates with no placeholders, where
      // there are never any data rows to trigger a render below.
      this.render();
      document.getElementById('previewIndex').textContent = '1 / 1';
      return;
    }

    const rowData = this.dataRows[this.currentPreviewIndex];

    // Preload all dynamic images before rendering
    await this.preloadDynamicImages(rowData);

    this.renderWithData(rowData);

    document.getElementById('previewStatus').textContent = `Previewing Row ${this.currentPreviewIndex + 1}`;
    document.getElementById('previewIndex').textContent = `${this.currentPreviewIndex + 1} / ${this.dataRows.length}`;

    document.getElementById('prevPreview').disabled = this.currentPreviewIndex === 0;
    document.getElementById('nextPreview').disabled = this.currentPreviewIndex >= this.dataRows.length - 1;
  }

  async preloadDynamicImages(data) {
    const imagePromises = [];

    // Check each element for dynamic image properties
    if (this.template.elements) {
      for (const element of this.template.elements) {
        if (element.dynamicProperties?.src?.isDynamic) {
          const placeholder = element.dynamicProperties.src.placeholder;
          const value = data[placeholder];
          if (value && !this.imageCache.has(value)) {
            imagePromises.push(this.loadDynamicImage(value));
          }
        }
      }
    }

    // Also preload images directly from data (for image type placeholders)
    for (const [name, config] of Object.entries(this.placeholders)) {
      if (config.type === 'image') {
        const value = data[name];
        if (value && !this.imageCache.has(value)) {
          imagePromises.push(this.loadDynamicImage(value));
        }
      }
    }

    await Promise.all(imagePromises);
  }

  navigatePreview(direction) {
    this.currentPreviewIndex = Math.max(0, Math.min(this.dataRows.length - 1, this.currentPreviewIndex + direction));
    this.updatePreview();
    this.renderRows();
  }

  render() {
    if (!this.template) return;
    this.renderWithData({});
  }

  renderWithData(data) {
    if (!this.template) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Draw background
    this.drawBackground(data);

    // Draw elements sorted by zIndex for proper layering (lower zIndex renders first = back)
    if (this.template.elements) {
      const sortedElements = [...this.template.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

      sortedElements.forEach(element => {
        if (!element.visible && element.visible !== undefined) return;
        ctx.save();

        if (element.rotation) {
          ctx.translate(element.x, element.y);
          ctx.rotate((element.rotation * Math.PI) / 180);
          ctx.translate(-element.x, -element.y);
        }

        const modifiedElement = this.applyDataToElement(element, data);

        if (element.type === 'text') {
          // Auto-fit text width to content
          this.autoFitTextWidth(modifiedElement, modifiedElement.text);
          this.drawTextElement(modifiedElement);
        } else if (element.type === 'image') {
          this.drawImageElement(modifiedElement, data);
        } else if (element.type === 'shape') {
          this.drawShapeElement(modifiedElement);
        }

        ctx.restore();
      });
    }
  }

  applyDataToElement(element, data) {
    const result = { ...element };

    // Method 1: Apply dynamicProperties (for backward compatibility)
    if (element.dynamicProperties) {
      for (const [property, config] of Object.entries(element.dynamicProperties)) {
        if (config.isDynamic && config.placeholder) {
          const value = data[config.placeholder];
          if (value !== undefined && value !== '') {
            result[property] = value;
          }
        }
      }
    }

    // Method 2: Template interpolation - replace {{placeholder}} patterns in text
    // This allows mixed content like "DESTINATION {{destination}}" -> "DESTINATION AUSTRALIA"
    if (result.text && typeof result.text === 'string') {
      result.text = this.interpolateText(result.text, data);
    }

    return result;
  }

  // Interpolate {{placeholder}} patterns in text with actual values
  interpolateText(text, data) {
    if (!text || typeof text !== 'string') return text;

    // Replace all {{placeholder}} patterns with corresponding data values
    return text.replace(/\{\{(\w+)\}\}/g, (match, placeholderName) => {
      const value = data[placeholderName];
      // If value exists, use it; otherwise keep the placeholder for visibility
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
      // Return empty string if no value (removes the placeholder)
      // Or return match to keep {{placeholder}} visible as reminder
      return '';
    });
  }

  drawBackground(data) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    const bgType = this.template.background_type;
    let bgValue = this.template.background_value;

    // Check for dynamic background
    if (this.template.background_isDynamic && this.template.background_placeholder) {
      const dynamicValue = data[this.template.background_placeholder];
      if (dynamicValue) {
        bgValue = dynamicValue;
      }
    }

    if (bgType === 'color') {
      ctx.fillStyle = bgValue || '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'gradient') {
      let gradientValue = bgValue;
      if (typeof bgValue === 'string') {
        try { gradientValue = JSON.parse(bgValue); } catch {}
      }

      if (gradientValue && gradientValue.start) {
        const { start, end, direction } = gradientValue;
        let gradient;

        if (direction === 'radial') {
          gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width / 2);
        } else {
          const coords = this.getGradientCoords(direction, width, height);
          gradient = ctx.createLinearGradient(...coords);
        }

        gradient.addColorStop(0, start);
        gradient.addColorStop(1, end);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }
    } else if (bgType === 'image') {
      if (this.template.backgroundImage) {
        const img = this.template.backgroundImage;
        const fitMode = this.template.background_fitMode || 'cover';
        const blur = this.template.background_blur || 0;

        // Calculate dimensions based on fit mode
        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;

        let drawWidth, drawHeight, drawX, drawY;

        switch (fitMode) {
          case 'fill':
          case 'stretch':
            // Stretch to fill (may distort)
            drawWidth = width;
            drawHeight = height;
            drawX = 0;
            drawY = 0;
            break;

          case 'contain':
            // Fit inside, maintain aspect ratio (letterbox)
            if (imgAspect > canvasAspect) {
              drawWidth = width;
              drawHeight = width / imgAspect;
            } else {
              drawHeight = height;
              drawWidth = height * imgAspect;
            }
            drawX = (width - drawWidth) / 2;
            drawY = (height - drawHeight) / 2;
            // Fill remaining area with color
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            break;

          case 'center':
            // Original size, centered
            drawWidth = img.width;
            drawHeight = img.height;
            drawX = (width - drawWidth) / 2;
            drawY = (height - drawHeight) / 2;
            // Fill canvas first
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            break;

          case 'cover':
          default:
            // Cover entire canvas, crop excess
            if (imgAspect > canvasAspect) {
              drawHeight = height;
              drawWidth = height * imgAspect;
            } else {
              drawWidth = width;
              drawHeight = width / imgAspect;
            }
            drawX = (width - drawWidth) / 2;
            drawY = (height - drawHeight) / 2;
            break;
        }

        // Apply blur if set
        if (blur > 0) {
          ctx.filter = `blur(${blur}px)`;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Reset filter
        if (blur > 0) {
          ctx.filter = 'none';
        }
      } else {
        // Fallback if image not loaded
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        console.warn('Background image not loaded, using fallback color');
      }
    } else {
      // Default fallback
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, width, height);
    }
  }

  getGradientCoords(direction, w, h) {
    switch (direction) {
      case 'to bottom': return [0, 0, 0, h];
      case 'to right': return [0, 0, w, 0];
      case 'to bottom right': return [0, 0, w, h];
      case 'to bottom left': return [w, 0, 0, h];
      default: return [0, 0, 0, h];
    }
  }

  drawTextElement(element) {
    const ctx = this.ctx;
    ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize}px ${element.fontFamily || 'Inter'}`;
    ctx.textBaseline = 'middle';

    const textAlign = element.textAlign || 'center';
    const lines = this.wrapText(element.text || '', element.width);
    const lineHeight = element.fontSize * (element.lineHeight || 1.2);
    const totalHeight = lines.length * lineHeight;
    const padding = element.padding || 0;
    const borderRadius = element.borderRadius || 0;
    const borderWidth = element.borderWidth || 0;
    const backgroundOpacity = (element.backgroundOpacity || 0) / 100;
    const strokeWidth = element.strokeWidth || 0;

    // Calculate box dimensions
    const boxWidth = element.width + (padding * 2);
    const boxHeight = totalHeight + (padding * 2);

    // Calculate box position based on alignment (Figma-like anchor points)
    let boxX, textX;
    switch (textAlign) {
      case 'left':
        boxX = element.x - padding;
        textX = element.x;
        ctx.textAlign = 'left';
        break;
      case 'right':
        boxX = element.x - element.width - padding;
        textX = element.x;
        ctx.textAlign = 'right';
        break;
      case 'center':
      default:
        boxX = element.x - boxWidth / 2;
        textX = element.x;
        ctx.textAlign = 'center';
        break;
    }
    const boxY = element.y - boxHeight / 2;

    // Draw background if opacity > 0
    if (backgroundOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = backgroundOpacity;
      ctx.fillStyle = element.backgroundColor || '#000000';

      if (borderRadius > 0) {
        this.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
        ctx.fill();
      } else {
        ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      }
      ctx.restore();
    }

    // Draw border if width > 0
    if (borderWidth > 0) {
      ctx.save();
      ctx.strokeStyle = element.borderColor || '#000000';
      ctx.lineWidth = borderWidth;

      if (borderRadius > 0) {
        this.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
        ctx.stroke();
      } else {
        ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      }
      ctx.restore();
    }

    // Draw text with optional stroke
    let startY = element.y - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;

      // Draw stroke first (behind fill)
      if (strokeWidth > 0) {
        ctx.strokeStyle = element.strokeColor || '#000000';
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;
        ctx.strokeText(line, textX, lineY);
      }

      // Draw fill on top
      ctx.fillStyle = element.color || '#ffffff';
      ctx.fillText(line, textX, lineY);
    });
  }

  wrapText(text, maxWidth) {
    if (!text) return [''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = this.ctx.measureText(testLine);

      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) lines.push(currentLine);
    return lines.length ? lines : [text];
  }

  // Measure text width for auto-fit
  measureTextWidth(element, text) {
    this.ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize}px ${element.fontFamily || 'Inter'}`;
    const lines = (text || element.text || '').split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
      const width = this.ctx.measureText(line).width;
      if (width > maxWidth) maxWidth = width;
    });
    return maxWidth;
  }

  // Auto-fit text element width to content - exact fit
  autoFitTextWidth(element, text) {
    if (element.type !== 'text') return;
    const textWidth = this.measureTextWidth(element, text);
    element.width = Math.max(50, textWidth + 4); // Minimal padding for exact fit
  }

  drawImageElement(element, data) {
    const ctx = this.ctx;

    // Determine image source - check for dynamic src
    let imageSrc = element.src;
    if (element.dynamicProperties?.src?.isDynamic) {
      const placeholder = element.dynamicProperties.src.placeholder;
      if (data[placeholder]) {
        imageSrc = data[placeholder];
      }
    }

    // Get the image from cache or element
    let img = null;
    if (imageSrc && this.imageCache.has(imageSrc)) {
      img = this.imageCache.get(imageSrc);
    } else if (imageSrc === element.src && element.image) {
      img = element.image;
    }

    if (!img) return;

    ctx.globalAlpha = (element.opacity || 100) / 100;

    // Calculate fit dimensions based on objectFit mode
    const imgAspect = img.width / img.height;
    const boxAspect = element.width / element.height;
    const fitMode = element.objectFit || 'contain';

    let drawWidth, drawHeight, drawX, drawY;
    let sourceX = 0, sourceY = 0, sourceWidth = img.width, sourceHeight = img.height;

    switch (fitMode) {
      case 'fill':
      case 'stretch':
        // Stretch to fill entire box (may distort)
        drawWidth = element.width;
        drawHeight = element.height;
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;

      case 'cover':
        // Cover entire box, crop excess
        if (imgAspect > boxAspect) {
          // Image is wider - crop sides
          drawHeight = element.height;
          drawWidth = element.height * imgAspect;
        } else {
          // Image is taller - crop top/bottom
          drawWidth = element.width;
          drawHeight = element.width / imgAspect;
        }
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;

      case 'center':
      case 'none':
        // Original size, centered (may overflow)
        drawWidth = img.width;
        drawHeight = img.height;
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;

      case 'contain':
      default:
        // Fit inside box, maintain aspect ratio (letterbox)
        if (imgAspect > boxAspect) {
          drawWidth = element.width;
          drawHeight = element.width / imgAspect;
        } else {
          drawHeight = element.height;
          drawWidth = element.height * imgAspect;
        }
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;
    }

    // Calculate clip coordinates
    const clipX = element.x - element.width / 2;
    const clipY = element.y - element.height / 2;

    // Check if this should be a circular clip (borderRadius >= half of min dimension)
    const minDimension = Math.min(element.width, element.height);
    const isCircular = element.borderRadius && element.borderRadius >= minDimension / 2;

    // Apply clipping based on shape
    ctx.save();
    if (isCircular) {
      // Use circular clip for circular images (like person photos)
      ctx.beginPath();
      ctx.arc(element.x, element.y, minDimension / 2, 0, Math.PI * 2);
      ctx.clip();
    } else if (element.borderRadius || fitMode === 'cover') {
      // Clip to the placeholder area with rounded corners
      this.roundRect(clipX, clipY, element.width, element.height, element.borderRadius || 0);
      ctx.clip();
    }
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    // Draw stroke/border outline around the image
    const strokeWidth = element.strokeWidth || 0;
    if (strokeWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 1; // Reset alpha for stroke visibility
      ctx.strokeStyle = element.strokeColor || '#000000';
      ctx.lineWidth = strokeWidth;
      // Draw stroke following border radius (circular or rounded)
      if (isCircular) {
        ctx.beginPath();
        ctx.arc(element.x, element.y, minDimension / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (element.borderRadius) {
        this.roundRect(clipX, clipY, element.width, element.height, element.borderRadius);
        ctx.stroke();
      } else {
        ctx.strokeRect(clipX, clipY, element.width, element.height);
      }
      ctx.restore();
    }

    ctx.globalAlpha = 1;
  }

  drawShapeElement(element) {
    const ctx = this.ctx;
    ctx.globalAlpha = (element.opacity || 100) / 100;
    ctx.fillStyle = element.fill || '#e94560';
    ctx.strokeStyle = element.stroke || '#000000';
    ctx.lineWidth = element.strokeWidth || 0;

    const x = element.x - element.width / 2;
    const y = element.y - element.height / 2;
    const borderRadius = element.borderRadius || 0;

    switch (element.shapeType) {
      case 'rect':
        if (borderRadius > 0) {
          // Draw rounded rectangle
          this.roundRect(x, y, element.width, element.height, borderRadius);
          ctx.fill();
          if (element.strokeWidth) {
            ctx.stroke();
          }
        } else {
          ctx.fillRect(x, y, element.width, element.height);
          if (element.strokeWidth) ctx.strokeRect(x, y, element.width, element.height);
        }
        break;

      case 'circle':
        ctx.beginPath();
        ctx.ellipse(element.x, element.y, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        if (element.strokeWidth) ctx.stroke();
        break;

      case 'triangle':
        ctx.beginPath();
        ctx.moveTo(element.x, y);
        ctx.lineTo(x + element.width, y + element.height);
        ctx.lineTo(x, y + element.height);
        ctx.closePath();
        ctx.fill();
        if (element.strokeWidth) ctx.stroke();
        break;

      case 'line':
        ctx.beginPath();
        ctx.moveTo(x, element.y);
        ctx.lineTo(x + element.width, element.y);
        ctx.strokeStyle = element.fill;
        ctx.lineWidth = element.height || 4;
        ctx.stroke();
        break;
    }

    ctx.globalAlpha = 1;
  }

  roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, r);
    this.ctx.arcTo(x + w, y + h, x, y + h, r);
    this.ctx.arcTo(x, y + h, x, y, r);
    this.ctx.arcTo(x, y, x + w, y, r);
    this.ctx.closePath();
  }

  // ==================== GENERATION ====================

  updateGenerateButton() {
    const validRows = this.dataRows.filter(row => {
      return Object.keys(this.placeholders).some(name => {
        const value = row[name];
        return value && (typeof value === 'string' ? value.trim() : value);
      });
    });

    const count = validRows.length;
    document.getElementById('generateCount').textContent = count;
    document.getElementById('generateAllBtn').disabled = count === 0;
  }

  async generateAllPosts() {
    const validRows = this.dataRows.filter(row => {
      return Object.keys(this.placeholders).some(name => {
        const value = row[name];
        return value && (typeof value === 'string' ? value.trim() : value);
      });
    });

    if (validRows.length === 0) {
      this.showToast('No valid data rows to generate', 'warning');
      return;
    }

    document.getElementById('generatingModal').classList.add('show');
    document.getElementById('generateProgress').style.width = '0%';
    document.getElementById('generateStatus').textContent = 'Preparing...';

    this.generatedImages = [];

    try {
      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        document.getElementById('generateStatus').textContent = `Generating ${i + 1} of ${validRows.length}...`;
        document.getElementById('generateProgress').style.width = `${((i + 1) / validRows.length) * 100}%`;

        // Preload images first
        await this.preloadDynamicImages(row);

        // Render with data
        this.renderWithData(row);

        // Wait a bit for rendering
        await new Promise(r => setTimeout(r, 100));

        // Capture canvas
        const dataUrl = this.canvas.toDataURL('image/png');
        this.generatedImages.push({
          data: dataUrl,
          rowData: row,
          index: i
        });
      }

      document.getElementById('generatingModal').classList.remove('show');
      this.showResults();
    } catch (error) {
      console.error('Generation error:', error);
      document.getElementById('generatingModal').classList.remove('show');
      this.showToast('Failed to generate posts', 'error');
    }
  }

  showResults() {
    const grid = document.getElementById('resultsGrid');
    grid.innerHTML = this.generatedImages.map((img, i) => `
      <div class="result-item" data-index="${i}" title="Row ${i + 1}">
        <img src="${img.data}" alt="Generated post ${i + 1}">
      </div>
    `).join('');

    // Click to download individual
    grid.querySelectorAll('.result-item').forEach(item => {
      item.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.downloadSingleImage(index);
      });
    });

    document.getElementById('resultsModal').classList.add('show');
  }

  downloadSingleImage(index) {
    const img = this.generatedImages[index];
    const link = document.createElement('a');
    link.download = `post_${index + 1}.png`;
    link.href = img.data;
    link.click();
  }

  async downloadAllAsZip() {
    // Simple implementation - download each image
    // For actual ZIP, would need JSZip library
    this.showToast('Downloading images...', 'info');

    for (let i = 0; i < this.generatedImages.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      this.downloadSingleImage(i);
    }

    this.showToast('All images downloaded', 'success');
  }

  async saveGeneratedPosts() {
    this.showToast('Saving posts...', 'info');

    let savedCount = 0;

    try {
      for (let i = 0; i < this.generatedImages.length; i++) {
        const img = this.generatedImages[i];

        const response = await fetch('http://localhost:3004/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: this.businessId,
            template_id: this.templateId,
            title: `Post ${i + 1} - ${this.template.name}`,
            image: img.data,
            content: img.rowData,
            platforms: [this.template.platform || 'instagram'],
            status: 'draft'
          })
        });

        const result = await response.json();
        if (result.success) {
          savedCount++;
        }
      }

      this.closeModals();

      if (savedCount === this.generatedImages.length) {
        this.showToast(`${savedCount} posts saved successfully!`, 'success');
      } else {
        this.showToast(`${savedCount} of ${this.generatedImages.length} posts saved`, 'warning');
      }
    } catch (error) {
      console.error('Save error:', error);
      this.showToast('Failed to save posts', 'error');
    }
  }

  // ==================== IMAGE CROPPER ====================

  openCropModal(imageSrc, field, containerSelector) {
    this.cropField = field;
    this.cropContainerSelector = containerSelector;
    this.cropAspectRatio = null; // free aspect ratio
    this.cropRotation = 0;

    const cropCanvas = document.getElementById('cropCanvas');
    const ctx = cropCanvas.getContext('2d');

    // Load image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.cropImage = img;

      // Calculate display size (fit within max dimensions)
      const maxWidth = 600;
      const maxHeight = 400;
      let displayWidth = img.width;
      let displayHeight = img.height;

      if (displayWidth > maxWidth) {
        displayHeight = (maxWidth / displayWidth) * displayHeight;
        displayWidth = maxWidth;
      }
      if (displayHeight > maxHeight) {
        displayWidth = (maxHeight / displayHeight) * displayWidth;
        displayHeight = maxHeight;
      }

      this.cropDisplayScale = displayWidth / img.width;

      cropCanvas.width = displayWidth;
      cropCanvas.height = displayHeight;
      ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

      // Initialize crop selection
      this.initCropSelection(displayWidth, displayHeight);

      // Setup crop modal events
      this.setupCropModalEvents();

      document.getElementById('cropModal').classList.add('show');
    };
    img.onerror = () => {
      this.showToast('Failed to load image for cropping', 'error');
    };
    img.src = imageSrc;
  }

  initCropSelection(canvasWidth, canvasHeight) {
    const selection = document.getElementById('cropSelection');

    // Initial selection: 80% of image centered
    const margin = 0.1;
    this.cropSelection = {
      x: canvasWidth * margin,
      y: canvasHeight * margin,
      width: canvasWidth * (1 - 2 * margin),
      height: canvasHeight * (1 - 2 * margin)
    };

    this.updateCropSelectionUI();

    // Add handles
    selection.innerHTML = `
      <div class="crop-handle nw" data-handle="nw"></div>
      <div class="crop-handle n" data-handle="n"></div>
      <div class="crop-handle ne" data-handle="ne"></div>
      <div class="crop-handle w" data-handle="w"></div>
      <div class="crop-handle e" data-handle="e"></div>
      <div class="crop-handle sw" data-handle="sw"></div>
      <div class="crop-handle s" data-handle="s"></div>
      <div class="crop-handle se" data-handle="se"></div>
    `;
  }

  updateCropSelectionUI() {
    const selection = document.getElementById('cropSelection');
    const { x, y, width, height } = this.cropSelection;
    selection.style.left = `${x}px`;
    selection.style.top = `${y}px`;
    selection.style.width = `${width}px`;
    selection.style.height = `${height}px`;
  }

  setupCropModalEvents() {
    const selection = document.getElementById('cropSelection');
    const cropCanvas = document.getElementById('cropCanvas');

    // Remove old listeners
    selection.onmousedown = null;
    document.onmousemove = null;
    document.onmouseup = null;

    let isDragging = false;
    let isResizing = false;
    let resizeHandle = null;
    let startX, startY, startSelection;

    // Selection drag
    selection.onmousedown = (e) => {
      if (e.target.classList.contains('crop-handle')) {
        isResizing = true;
        resizeHandle = e.target.dataset.handle;
      } else {
        isDragging = true;
      }
      startX = e.clientX;
      startY = e.clientY;
      startSelection = { ...this.cropSelection };
      e.preventDefault();
    };

    document.onmousemove = (e) => {
      if (!isDragging && !isResizing) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const canvasRect = cropCanvas.getBoundingClientRect();

      if (isDragging) {
        let newX = startSelection.x + dx;
        let newY = startSelection.y + dy;

        // Constrain to canvas bounds
        newX = Math.max(0, Math.min(newX, cropCanvas.width - this.cropSelection.width));
        newY = Math.max(0, Math.min(newY, cropCanvas.height - this.cropSelection.height));

        this.cropSelection.x = newX;
        this.cropSelection.y = newY;
      } else if (isResizing) {
        this.handleCropResize(resizeHandle, dx, dy, startSelection, cropCanvas.width, cropCanvas.height);
      }

      this.updateCropSelectionUI();
    };

    document.onmouseup = () => {
      isDragging = false;
      isResizing = false;
      resizeHandle = null;
    };

    // Aspect ratio buttons
    document.querySelectorAll('.aspect-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const aspect = btn.dataset.aspect;
        if (aspect === 'free') {
          this.cropAspectRatio = null;
        } else {
          const [w, h] = aspect.split(':').map(Number);
          this.cropAspectRatio = w / h;
          this.applyAspectRatio();
        }
      };
    });

    // Reset button
    document.getElementById('resetCropBtn').onclick = () => {
      this.cropRotation = 0;
      this.initCropSelection(cropCanvas.width, cropCanvas.height);
      this.redrawCropCanvas();
    };

    // Rotate button
    document.getElementById('rotateCropBtn').onclick = () => {
      this.cropRotation = (this.cropRotation + 90) % 360;
      this.redrawCropCanvas();
    };

    // Apply crop button
    document.getElementById('applyCropBtn').onclick = () => {
      this.applyCrop();
    };
  }

  handleCropResize(handle, dx, dy, start, maxWidth, maxHeight) {
    let { x, y, width, height } = start;
    const minSize = 30;

    switch (handle) {
      case 'se':
        width = Math.max(minSize, Math.min(start.width + dx, maxWidth - x));
        height = Math.max(minSize, Math.min(start.height + dy, maxHeight - y));
        break;
      case 'sw':
        const newWidthSW = Math.max(minSize, start.width - dx);
        x = Math.max(0, start.x + start.width - newWidthSW);
        width = start.x + start.width - x;
        height = Math.max(minSize, Math.min(start.height + dy, maxHeight - y));
        break;
      case 'ne':
        width = Math.max(minSize, Math.min(start.width + dx, maxWidth - x));
        const newHeightNE = Math.max(minSize, start.height - dy);
        y = Math.max(0, start.y + start.height - newHeightNE);
        height = start.y + start.height - y;
        break;
      case 'nw':
        const newWidthNW = Math.max(minSize, start.width - dx);
        x = Math.max(0, start.x + start.width - newWidthNW);
        width = start.x + start.width - x;
        const newHeightNW = Math.max(minSize, start.height - dy);
        y = Math.max(0, start.y + start.height - newHeightNW);
        height = start.y + start.height - y;
        break;
      case 'n':
        const newHeightN = Math.max(minSize, start.height - dy);
        y = Math.max(0, start.y + start.height - newHeightN);
        height = start.y + start.height - y;
        break;
      case 's':
        height = Math.max(minSize, Math.min(start.height + dy, maxHeight - y));
        break;
      case 'e':
        width = Math.max(minSize, Math.min(start.width + dx, maxWidth - x));
        break;
      case 'w':
        const newWidthW = Math.max(minSize, start.width - dx);
        x = Math.max(0, start.x + start.width - newWidthW);
        width = start.x + start.width - x;
        break;
    }

    // Apply aspect ratio constraint
    if (this.cropAspectRatio) {
      if (['n', 's', 'e', 'w'].includes(handle)) {
        if (handle === 'n' || handle === 's') {
          width = height * this.cropAspectRatio;
          if (x + width > maxWidth) width = maxWidth - x;
        } else {
          height = width / this.cropAspectRatio;
          if (y + height > maxHeight) height = maxHeight - y;
        }
      } else {
        // Corner handles - adjust based on larger dimension change
        const aspectHeight = width / this.cropAspectRatio;
        if (aspectHeight <= maxHeight - y) {
          height = aspectHeight;
        } else {
          height = maxHeight - y;
          width = height * this.cropAspectRatio;
        }
      }
    }

    this.cropSelection = { x, y, width, height };
  }

  applyAspectRatio() {
    if (!this.cropAspectRatio) return;

    const cropCanvas = document.getElementById('cropCanvas');
    const maxWidth = cropCanvas.width;
    const maxHeight = cropCanvas.height;

    let { x, y, width, height } = this.cropSelection;

    // Calculate new dimensions maintaining aspect ratio
    const currentAspect = width / height;

    if (currentAspect > this.cropAspectRatio) {
      // Too wide, adjust width
      width = height * this.cropAspectRatio;
    } else {
      // Too tall, adjust height
      height = width / this.cropAspectRatio;
    }

    // Ensure fits within canvas
    if (x + width > maxWidth) {
      width = maxWidth - x;
      height = width / this.cropAspectRatio;
    }
    if (y + height > maxHeight) {
      height = maxHeight - y;
      width = height * this.cropAspectRatio;
    }

    this.cropSelection = { x, y, width, height };
    this.updateCropSelectionUI();
  }

  redrawCropCanvas() {
    const cropCanvas = document.getElementById('cropCanvas');
    const ctx = cropCanvas.getContext('2d');

    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

    ctx.save();
    ctx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    ctx.rotate((this.cropRotation * Math.PI) / 180);
    ctx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    ctx.drawImage(this.cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    ctx.restore();
  }

  applyCrop() {
    const { x, y, width, height } = this.cropSelection;
    const scale = 1 / this.cropDisplayScale;

    // Create output canvas
    const outputCanvas = document.createElement('canvas');
    const outputCtx = outputCanvas.getContext('2d');

    // Original crop dimensions
    const srcX = x * scale;
    const srcY = y * scale;
    const srcWidth = width * scale;
    const srcHeight = height * scale;

    outputCanvas.width = srcWidth;
    outputCanvas.height = srcHeight;

    // Handle rotation
    if (this.cropRotation !== 0) {
      // Create rotated source canvas first
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = this.cropImage.width;
      tempCanvas.height = this.cropImage.height;

      tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
      tempCtx.rotate((this.cropRotation * Math.PI) / 180);
      tempCtx.translate(-tempCanvas.width / 2, -tempCanvas.height / 2);
      tempCtx.drawImage(this.cropImage, 0, 0);

      outputCtx.drawImage(tempCanvas, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);
    } else {
      outputCtx.drawImage(this.cropImage, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);
    }

    // Get cropped image data URL
    const croppedDataUrl = outputCanvas.toDataURL('image/png');

    // Update the field
    this.setImagePreview(this.cropField, croppedDataUrl, this.cropContainerSelector);

    // Close modal
    document.getElementById('cropModal').classList.remove('show');
    this.showToast('Image cropped successfully', 'success');
  }

  // ==================== PUBLISHING ====================

  async openPublishModal() {
    // First, save the posts to get post IDs
    if (!this.savedPostIds || this.savedPostIds.length === 0) {
      this.showToast('Saving posts first...', 'info');
      await this.saveGeneratedPosts(true); // Save without closing modal
    }

    // Close results modal
    document.getElementById('resultsModal').classList.remove('show');

    // Load platforms and accounts
    await this.loadPlatforms();

    // Pre-fill caption from first generated post
    if (this.generatedImages.length > 0) {
      const firstImage = this.generatedImages[0];
      const caption = firstImage.rowData?.caption || this.template?.name || '';
      document.getElementById('publishCaption').value = caption;
      this.updateCharCount(caption);
    }

    // Show publish modal
    document.getElementById('publishModal').classList.add('show');
  }

  async loadPlatforms() {
    try {
      const response = await fetch(`http://localhost:3003/api/social/platforms?business_id=${this.businessId}`);
      const data = await response.json();

      if (data.success) {
        this.platforms = data.platforms;
        this.renderPlatformGrid();
        this.renderAccountsList();
      }
    } catch (error) {
      console.error('Failed to load platforms:', error);
      this.showToast('Failed to load platforms', 'error');
    }
  }

  renderPlatformGrid() {
    const grid = document.getElementById('platformGrid');
    if (!grid || !this.platforms) return;

    // Build cards - show individual accounts for platforms with multiple accounts
    let cards = [];

    this.platforms
      .filter(p => p.id !== 'whatsapp')
      .forEach(platform => {
        const accounts = platform.accounts || [];
        const isConfigured = platform.configured;

        if (accounts.length > 1) {
          // Multiple accounts - show each as separate card
          accounts.forEach(account => {
            cards.push(`
              <div class="platform-card"
                   data-platform="${platform.id}"
                   data-account-id="${account.id}"
                   onclick="generator.togglePlatformAccount('${platform.id}', '${account.id}')">
                <div class="platform-icon ${platform.id}">
                  <i class="fab fa-${platform.id}"></i>
                </div>
                <div class="platform-info">
                  <div class="platform-name">${account.account_name}</div>
                  <div class="platform-status connected">${platform.name} Page</div>
                </div>
                <div class="platform-check">
                  <i class="fas fa-check"></i>
                </div>
              </div>
            `);
          });
        } else if (accounts.length === 1) {
          // Single account
          const account = accounts[0];
          cards.push(`
            <div class="platform-card"
                 data-platform="${platform.id}"
                 data-account-id="${account.id}"
                 onclick="generator.togglePlatformAccount('${platform.id}', '${account.id}')">
              <div class="platform-icon ${platform.id}">
                <i class="fab fa-${platform.id}"></i>
              </div>
              <div class="platform-info">
                <div class="platform-name">${account.account_name || platform.name}</div>
                <div class="platform-status connected">Connected</div>
              </div>
              <div class="platform-check">
                <i class="fas fa-check"></i>
              </div>
            </div>
          `);
        } else {
          // No accounts - show as disabled
          cards.push(`
            <div class="platform-card disabled"
                 data-platform="${platform.id}">
              <div class="platform-icon ${platform.id}">
                <i class="fab fa-${platform.id}"></i>
              </div>
              <div class="platform-info">
                <div class="platform-name">${platform.name}</div>
                <div class="platform-status">
                  ${isConfigured ? 'Not connected' : 'Not configured'}
                </div>
              </div>
              <div class="platform-check">
                <i class="fas fa-check"></i>
              </div>
            </div>
          `);
        }
      });

    grid.innerHTML = cards.join('');

    this.selectedPlatforms = [];
    this.selectedAccounts = {};  // { platform: accountId }
  }

  togglePlatformAccount(platformId, accountId) {
    const card = document.querySelector(`.platform-card[data-platform="${platformId}"][data-account-id="${accountId}"]`);
    if (!card || card.classList.contains('disabled')) return;

    // Check if this specific account is selected
    const key = `${platformId}:${accountId}`;
    const index = this.selectedPlatforms.indexOf(key);

    if (index === -1) {
      this.selectedPlatforms.push(key);
      this.selectedAccounts[key] = { platform: platformId, accountId };
      card.classList.add('selected');
    } else {
      this.selectedPlatforms.splice(index, 1);
      delete this.selectedAccounts[key];
      card.classList.remove('selected');
    }

    this.updatePublishButton();
  }

  renderAccountsList() {
    const list = document.getElementById('accountsList');
    if (!list || !this.platforms) return;

    const connectedAccounts = this.platforms.filter(p => p.connected && p.account);

    if (connectedAccounts.length === 0) {
      list.innerHTML = '<p class="no-accounts">No accounts connected. Connect an account to publish.</p>';
      return;
    }

    list.innerHTML = connectedAccounts.map(platform => {
      const account = platform.account;
      return `
        <div class="account-item">
          <div class="account-avatar">
            ${account.profile_picture
              ? `<img src="${account.profile_picture}" alt="${account.account_name}">`
              : `<i class="fab fa-${platform.id}"></i>`
            }
          </div>
          <div class="account-info">
            <div class="account-name">${account.account_name || 'Unknown'}</div>
            <div class="account-platform">${platform.name}</div>
          </div>
          <span class="account-status active">Active</span>
        </div>
      `;
    }).join('');
  }

  togglePlatform(platformId) {
    // Legacy support - find the first account for this platform
    const platform = this.platforms.find(p => p.id === platformId);
    if (platform && platform.accounts && platform.accounts.length > 0) {
      this.togglePlatformAccount(platformId, platform.accounts[0].id);
    }
  }

  updatePublishButton() {
    const btn = document.getElementById('confirmPublishBtn');
    const text = document.getElementById('publishBtnText');
    const isScheduled = document.getElementById('scheduleToggle')?.checked;

    if (this.selectedPlatforms.length === 0) {
      btn.disabled = true;
      text.textContent = 'Select platforms';
    } else {
      btn.disabled = false;
      if (isScheduled) {
        text.textContent = `Schedule to ${this.selectedPlatforms.length} platform${this.selectedPlatforms.length > 1 ? 's' : ''}`;
      } else {
        text.textContent = `Publish to ${this.selectedPlatforms.length} platform${this.selectedPlatforms.length > 1 ? 's' : ''}`;
      }
    }
  }

  toggleSchedulePicker(show) {
    const picker = document.getElementById('schedulePicker');
    if (picker) {
      picker.classList.toggle('hidden', !show);
    }
    this.updatePublishButton();
  }

  updateCharCount(text) {
    const count = document.getElementById('captionCount');
    if (!count) return;

    const hashtags = document.getElementById('publishHashtags')?.value || '';
    const total = (text || '').length + hashtags.length;
    const limit = 2200;

    count.textContent = `${total} / ${limit}`;
    count.classList.remove('warning', 'error');

    if (total > limit) {
      count.classList.add('error');
    } else if (total > limit * 0.9) {
      count.classList.add('warning');
    }
  }

  async confirmPublish() {
    if (this.selectedPlatforms.length === 0) {
      this.showToast('Please select at least one platform', 'warning');
      return;
    }

    const isScheduled = document.getElementById('scheduleToggle')?.checked;
    const scheduleDateTime = document.getElementById('scheduleDateTime')?.value;

    if (isScheduled && !scheduleDateTime) {
      this.showToast('Please select a schedule date and time', 'warning');
      return;
    }

    const caption = document.getElementById('publishCaption')?.value || '';
    const hashtags = document.getElementById('publishHashtags')?.value || '';

    // Extract platforms and account IDs
    const platforms = [];
    const social_account_ids = [];

    this.selectedPlatforms.forEach(key => {
      const [platform, accountId] = key.split(':');
      if (!platforms.includes(platform)) {
        platforms.push(platform);
      }
      social_account_ids.push(accountId);
    });

    // Close publish modal
    document.getElementById('publishModal').classList.remove('show');

    // For scheduling: process in background and show immediate success
    if (isScheduled) {
      this.showToast('Scheduling posts...', 'info');

      try {
        let successCount = 0;
        const scheduledTime = new Date(scheduleDateTime).toLocaleString();

        for (let i = 0; i < this.savedPostIds.length; i++) {
          const postId = this.savedPostIds[i];

          const response = await fetch('http://localhost:3003/api/publish/schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              post_id: postId,
              platforms,
              social_account_ids,
              caption,
              hashtags,
              scheduled_at: new Date(scheduleDateTime).toISOString()
            })
          });

          const result = await response.json();
          if (result.success) {
            successCount++;
          }
        }

        if (successCount === this.savedPostIds.length) {
          this.showToast(`${successCount} post(s) scheduled for ${scheduledTime}`, 'success');
        } else {
          this.showToast(`${successCount} of ${this.savedPostIds.length} posts scheduled`, 'warning');
        }

        // Reset state
        this.closeModals();
        this.generatedImages = [];
        this.savedPostIds = [];

      } catch (error) {
        console.error('Scheduling error:', error);
        this.showToast('Failed to schedule posts: ' + error.message, 'error');
      }

      return;
    }

    // For immediate publishing: show progress modal
    this.showPublishingProgress();

    try {
      // Publish each saved post
      for (let i = 0; i < this.savedPostIds.length; i++) {
        const postId = this.savedPostIds[i];

        const response = await fetch('http://localhost:3003/api/publish/now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: postId,
            platforms,
            social_account_ids,
            caption,
            hashtags
          })
        });

        const result = await response.json();

        if (result.success) {
          this.updatePublishingStatus(result.results || result);
        } else {
          throw new Error(result.error || 'Publishing failed');
        }
      }

      this.showPublishingComplete();

    } catch (error) {
      console.error('Publishing error:', error);
      this.showPublishingError(error.message);
    }
  }

  showPublishingProgress() {
    const modal = document.getElementById('publishingProgressModal');
    const status = document.getElementById('publishingStatus');
    const footer = document.getElementById('publishingFooter');

    footer.classList.add('hidden');

    // Render platform cards - handle "platform:accountId" format
    status.innerHTML = this.selectedPlatforms.map(key => {
      const [platformId, accountId] = key.split(':');
      const platform = this.platforms.find(p => p.id === platformId);
      const account = platform?.accounts?.find(a => a.id === accountId);
      const displayName = account?.account_name || platform?.name || platformId;

      return `
        <div class="publishing-platform-card" data-platform="${platformId}" data-account-id="${accountId}">
          <div class="platform-icon ${platformId}">
            <i class="fab fa-${platformId}"></i>
          </div>
          <div class="platform-details">
            <div class="platform-name">${displayName}</div>
            <div class="platform-stage">Waiting...</div>
          </div>
          <div class="status-icon pending">
            <i class="fas fa-clock"></i>
          </div>
        </div>
      `;
    }).join('');

    document.getElementById('publishingProgress').style.width = '0%';
    document.getElementById('publishingStatusText').textContent = 'Starting...';

    modal.classList.add('show');
  }

  updatePublishingStatus(results) {
    const totalPlatforms = this.selectedPlatforms.length;
    let completedCount = 0;
    let failedCount = 0;

    // Handle scheduled posts
    if (results.scheduled_at) {
      const scheduledTime = new Date(results.scheduled_at).toLocaleString();
      document.querySelectorAll('.publishing-platform-card').forEach(card => {
        const stage = card.querySelector('.platform-stage');
        const icon = card.querySelector('.status-icon');
        stage.textContent = `Scheduled for ${scheduledTime}`;
        icon.className = 'status-icon success';
        icon.innerHTML = '<i class="fas fa-clock"></i>';
      });
      completedCount = totalPlatforms;
      const progress = 100;
      document.getElementById('publishingProgress').style.width = `${progress}%`;
      return;
    }

    if (results.jobs) {
      results.jobs.forEach(job => {
        const card = document.querySelector(`.publishing-platform-card[data-platform="${job.platform}"]`);
        if (card) {
          const stage = card.querySelector('.platform-stage');
          const icon = card.querySelector('.status-icon');

          if (job.status === 'completed') {
            completedCount++;
            stage.textContent = 'Published!';
            icon.className = 'status-icon success';
            icon.innerHTML = '<i class="fas fa-check"></i>';
          } else if (job.status === 'failed') {
            failedCount++;
            stage.textContent = job.result?.error || 'Failed';
            icon.className = 'status-icon failed';
            icon.innerHTML = '<i class="fas fa-times"></i>';
          } else if (job.status === 'pending') {
            completedCount++;
            stage.textContent = 'Scheduled';
            icon.className = 'status-icon success';
            icon.innerHTML = '<i class="fas fa-clock"></i>';
          } else {
            stage.textContent = job.status === 'processing' ? 'Publishing...' : 'Pending';
            if (job.status === 'processing') {
              icon.className = 'status-icon processing';
              icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
          }
        }
      });
    }

    // Update success/failed counts from results
    if (Array.isArray(results.success)) {
      results.success.forEach(s => {
        const card = document.querySelector(`.publishing-platform-card[data-platform="${s.platform}"]`);
        if (card) {
          const stage = card.querySelector('.platform-stage');
          const icon = card.querySelector('.status-icon');
          stage.textContent = 'Published!';
          icon.className = 'status-icon success';
          icon.innerHTML = '<i class="fas fa-check"></i>';
        }
      });
      completedCount = results.success.length;
    }

    if (Array.isArray(results.failed)) {
      results.failed.forEach(f => {
        const card = document.querySelector(`.publishing-platform-card[data-platform="${f.platform}"]`);
        if (card) {
          const stage = card.querySelector('.platform-stage');
          const icon = card.querySelector('.status-icon');
          stage.textContent = f.error || 'Failed';
          icon.className = 'status-icon failed';
          icon.innerHTML = '<i class="fas fa-times"></i>';
        }
      });
      failedCount = results.failed.length;
    }

    const progress = ((completedCount + failedCount) / totalPlatforms) * 100;
    document.getElementById('publishingProgress').style.width = `${progress}%`;

    if (completedCount + failedCount === totalPlatforms) {
      if (failedCount === 0) {
        document.getElementById('publishingStatusText').textContent = 'All platforms published successfully!';
      } else if (completedCount === 0) {
        document.getElementById('publishingStatusText').textContent = 'Publishing failed for all platforms';
      } else {
        document.getElementById('publishingStatusText').textContent = `Published to ${completedCount} platform(s), ${failedCount} failed`;
      }
    } else {
      document.getElementById('publishingStatusText').textContent = `Publishing... ${completedCount + failedCount}/${totalPlatforms}`;
    }
  }

  showPublishingComplete() {
    const footer = document.getElementById('publishingFooter');
    const retryBtn = document.getElementById('retryFailedBtn');

    footer.classList.remove('hidden');

    // Check if there were failures
    const failedCards = document.querySelectorAll('.status-icon.failed');
    if (failedCards.length > 0) {
      retryBtn.classList.remove('hidden');
    } else {
      retryBtn.classList.add('hidden');
    }

    // Update header
    const header = document.querySelector('#publishingProgressModal .modal-header h3');
    if (header) {
      header.innerHTML = '<i class="fas fa-check-circle text-success"></i> Publishing Complete';
    }
  }

  showPublishingError(message) {
    document.getElementById('publishingStatusText').textContent = `Error: ${message}`;
    document.getElementById('publishingProgress').style.width = '100%';
    document.getElementById('publishingProgress').style.background = 'var(--danger)';

    const footer = document.getElementById('publishingFooter');
    footer.classList.remove('hidden');
  }

  async retryFailedPublishing() {
    this.showToast('Retry functionality coming soon', 'info');
  }

  openConnectAccountModal() {
    this.renderConnectPlatforms();
    document.getElementById('connectAccountModal').classList.add('show');
  }

  renderConnectPlatforms() {
    const container = document.getElementById('connectPlatforms');
    if (!container || !this.platforms) return;

    container.innerHTML = this.platforms
      .filter(p => p.id !== 'whatsapp')
      .map(platform => {
        const isConnected = platform.connected;
        const isConfigured = platform.configured;

        return `
          <button class="connect-platform-btn"
                  ${!isConfigured ? 'disabled' : ''}
                  onclick="generator.connectPlatform('${platform.id}')">
            <div class="icon ${platform.id}">
              <i class="fab fa-${platform.id}"></i>
            </div>
            <div class="text">
              <div class="name">${platform.name}</div>
              <div class="note">
                ${isConnected ? 'Already connected - click to reconnect' : (isConfigured ? 'Click to connect' : 'API not configured')}
              </div>
            </div>
            <div class="arrow">
              <i class="fas fa-chevron-right"></i>
            </div>
          </button>
        `;
      }).join('');
  }

  connectPlatform(platformId) {
    const platform = this.platforms.find(p => p.id === platformId);
    if (!platform || !platform.authUrl) {
      this.showToast('Platform not available', 'error');
      return;
    }

    // Open OAuth popup
    const authUrl = `http://localhost:3003${platform.authUrl}&business_id=${this.businessId}`;
    const popup = window.open(authUrl, 'oauth', 'width=600,height=700,scrollbars=yes');

    // Store reference for cleanup
    this.oauthPopup = popup;
  }

  handleOAuthMessage(event) {
    if (event.data?.type === 'oauth-success') {
      this.showToast(`${event.data.platform || 'Account'} connected successfully!`, 'success');
      this.loadPlatforms(); // Reload platforms
      document.getElementById('connectAccountModal').classList.remove('show');
    } else if (event.data?.type === 'oauth-error') {
      this.showToast(`Connection failed: ${event.data.error}`, 'error');
    }
  }

  // Override saveGeneratedPosts to support silent save
  async saveGeneratedPosts(silent = false) {
    if (!silent) {
      this.showToast('Saving posts...', 'info');
    }

    this.savedPostIds = [];
    let savedCount = 0;

    try {
      for (let i = 0; i < this.generatedImages.length; i++) {
        const img = this.generatedImages[i];

        const response = await fetch('http://localhost:3004/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: this.businessId,
            template_id: this.templateId,
            title: `Post ${i + 1} - ${this.template.name}`,
            image: img.data,
            content: img.rowData,
            platforms: [this.template.platform || 'instagram'],
            status: 'draft'
          })
        });

        const result = await response.json();
        if (result.success && result.post) {
          this.savedPostIds.push(result.post.id);
          savedCount++;
        }
      }

      if (!silent) {
        this.closeModals();
        if (savedCount === this.generatedImages.length) {
          this.showToast(`${savedCount} posts saved successfully!`, 'success');
        } else {
          this.showToast(`${savedCount} of ${this.generatedImages.length} posts saved`, 'warning');
        }
      }
    } catch (error) {
      console.error('Save error:', error);
      if (!silent) {
        this.showToast('Failed to save posts', 'error');
      }
    }
  }

  // ==================== UTILITIES ====================

  closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
}

// Initialize
const generator = new PostGenerator();
