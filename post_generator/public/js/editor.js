// Template Editor with Placeholder Support

class TemplateEditor {
  constructor() {
    this.canvas = document.getElementById('mainCanvas');
    this.ctx = this.canvas.getContext('2d');

    // Editor state
    this.elements = [];
    this.selectedElement = null;
    this.selectedElements = [];  // Multi-select support
    this.currentTool = 'select';
    this.zoom = 1;

    // Multi-select box state
    this.isSelecting = false;
    this.selectionBox = null;
    this.selectionStart = { x: 0, y: 0 };

    // Canvas dimensions
    this.canvasWidth = 1080;
    this.canvasHeight = 1080;

    // Background
    this.background = {
      type: 'color',
      value: '#f5f5f5',
      isDynamic: false,
      placeholder: null
    };

    // Placeholders storage
    this.placeholders = {};

    // Template info
    this.templateId = new URLSearchParams(window.location.search).get('id');
    this.businessId = new URLSearchParams(window.location.search).get('business') || 'default';

    // Undo/Redo
    this.history = [];
    this.historyIndex = -1;

    // Drag state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Resize state
    this.isResizing = false;
    this.resizeHandle = null;
    this.resizeStart = { x: 0, y: 0, width: 0, height: 0, elX: 0, elY: 0 };

    // Current placeholder being created
    this.pendingPlaceholder = null;

    // Auto-save configuration
    this.autoSaveEnabled = true;
    this.autoSaveDelay = 3000; // 3 seconds after last change
    this.autoSaveTimer = null;
    this.hasUnsavedChanges = false;
    this.lastSavedAt = null;
    this.isSaving = false;

    this.init();
  }

  async init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupTemplateCreationModal();
    this.setupImagePicker();
    this.setupFontSelector();

    if (this.templateId) {
      await this.loadTemplate();
      this.render();
      this.renderLayers();
      this.renderPlaceholders();
      // Existing template - mark as saved initially
      this.markSaved();
    } else {
      // Show template creation modal for new templates
      this.showTemplateCreationModal();
      // New template - mark as unsaved
      this.updateSaveStatus('unsaved');
    }
  }

  setupFontSelector() {
    const fontSelect = document.getElementById('fontFamily');
    if (!fontSelect) return;

    // Update select to show font preview when changed
    const updateFontPreview = () => {
      fontSelect.style.fontFamily = fontSelect.value;
    };

    // Set initial font
    updateFontPreview();

    // Update on change
    fontSelect.addEventListener('change', updateFontPreview);

    // Style each option with its font (only works in some browsers)
    Array.from(fontSelect.options).forEach(option => {
      if (option.value && !option.disabled) {
        option.style.fontFamily = option.value;
      }
    });
  }

  setupTemplateCreationModal() {
    const modal = document.getElementById('templateCreateModal');
    if (!modal) return;

    // Size preset selection
    document.querySelectorAll('.size-preset').forEach(preset => {
      preset.addEventListener('click', () => {
        // Remove active from all presets
        document.querySelectorAll('.size-preset').forEach(p => p.classList.remove('active'));
        // Add active to clicked preset
        preset.classList.add('active');

        // Store selected size
        this.selectedSize = {
          width: parseInt(preset.dataset.width),
          height: parseInt(preset.dataset.height),
          platform: preset.dataset.platform,
          type: preset.dataset.type
        };

        // Enable create button
        document.getElementById('createTemplateBtn').disabled = false;
      });
    });

    // Custom size button
    document.getElementById('useCustomSizeBtn')?.addEventListener('click', () => {
      const width = parseInt(document.getElementById('customWidth').value) || 1080;
      const height = parseInt(document.getElementById('customHeight').value) || 1080;

      // Remove active from all presets
      document.querySelectorAll('.size-preset').forEach(p => p.classList.remove('active'));

      this.selectedSize = {
        width: Math.min(Math.max(width, 100), 4096),
        height: Math.min(Math.max(height, 100), 4096),
        platform: 'custom',
        type: 'custom'
      };

      document.getElementById('createTemplateBtn').disabled = false;
      this.showToast(`Custom size selected: ${this.selectedSize.width} x ${this.selectedSize.height}`, 'success');
    });

    // Create template button
    document.getElementById('createTemplateBtn')?.addEventListener('click', () => {
      this.createTemplateFromModal();
    });
  }

  showTemplateCreationModal() {
    const modal = document.getElementById('templateCreateModal');
    if (modal) {
      modal.classList.add('show');
      // Focus the name input
      document.getElementById('newTemplateName')?.focus();
    }
  }

  createTemplateFromModal() {
    if (!this.selectedSize) {
      this.showToast('Please select a template size', 'warning');
      return;
    }

    const templateName = document.getElementById('newTemplateName')?.value || 'New Template';

    // Set canvas dimensions
    this.canvasWidth = this.selectedSize.width;
    this.canvasHeight = this.selectedSize.height;

    // Update template name
    document.getElementById('templateName').value = templateName;

    // Set the platform button as active
    const platformBtn = document.querySelector(`.platform-btn[data-platform="${this.selectedSize.platform}"]`);
    if (platformBtn) {
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
      platformBtn.classList.add('active');
    }

    // Close modal
    document.getElementById('templateCreateModal').classList.remove('show');

    // Setup canvas with new dimensions
    this.setupCanvas();

    // Load default elements
    this.loadDefaultElements();

    // Render
    this.render();
    this.renderLayers();
    this.renderPlaceholders();

    this.showToast(`Template created: ${templateName} (${this.canvasWidth}x${this.canvasHeight})`, 'success');
  }

  setupCanvas() {
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.fitToScreen();
  }

  fitToScreen() {
    const container = document.getElementById('canvasContainer');
    const padding = 120; // Generous padding for comfortable editing
    const maxWidth = container.clientWidth - padding;
    const maxHeight = container.clientHeight - padding;

    const scaleX = maxWidth / this.canvasWidth;
    const scaleY = maxHeight / this.canvasHeight;
    this.zoom = Math.min(scaleX, scaleY, 1);

    this.applyZoom();
  }

  applyZoom() {
    const wrapper = document.getElementById('canvasWrapper');
    wrapper.style.transform = `scale(${this.zoom})`;
    document.getElementById('zoomDisplay').textContent = `${Math.round(this.zoom * 100)}%`;
  }

  setupEventListeners() {
    // Tool buttons
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.selectTool(btn.dataset.tool));
    });

    // Tool actions
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => this.handleAction(btn.dataset.action));
    });

    // Platform selector
    document.querySelectorAll('.platform-btn').forEach(btn => {
      btn.addEventListener('click', () => this.changePlatform(btn));
    });

    // Panel tabs
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchPanel(tab.dataset.panel));
    });

    // Canvas interactions
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

    // Close context menu on click elsewhere
    document.addEventListener('click', () => this.hideContextMenu());
    document.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('#layerContextMenu')) {
        // Allow default context menu elsewhere
      }
    });

    // Setup context menu
    this.setupContextMenu();

    // Resize handles
    document.querySelectorAll('.handle').forEach(handle => {
      handle.addEventListener('mousedown', (e) => this.handleResizeStart(e, handle.dataset.handle));
    });
    document.addEventListener('mousemove', (e) => this.handleResizeMove(e));
    document.addEventListener('mouseup', () => this.handleResizeEnd());

    // Window resize
    window.addEventListener('resize', () => this.fitToScreen());

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Property inputs
    this.setupPropertyListeners();

    // Background options
    this.setupBackgroundListeners();

    // Modal listeners
    this.setupModalListeners();

    // Dynamic toggle buttons
    this.setupDynamicToggleListeners();

    // Header buttons
    document.getElementById('saveBtn')?.addEventListener('click', () => this.saveTemplate());
    document.getElementById('previewBtn')?.addEventListener('click', () => this.showExportModal());
    document.getElementById('generateBtn')?.addEventListener('click', () => this.goToGenerate());

    // AI Template Generator
    document.getElementById('aiTemplateBtn')?.addEventListener('click', () => {
      document.getElementById('textToTemplateModal').classList.add('show');
    });

    document.getElementById('generateTemplateBtn')?.addEventListener('click', () => this.generateTemplateFromText());

    // Example chips for AI template
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('templateDescription').value = chip.dataset.example;
      });
    });

    // AI Chat Panel
    this.setupAIChatListeners();
  }

  setupPropertyListeners() {
    // Text properties
    ['textContent', 'fontFamily', 'fontSize', 'fontWeight', 'textColor', 'lineHeight', 'letterSpacing'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updateSelectedElement());
        el.addEventListener('change', () => this.updateSelectedElement());
      }
    });

    // Text alignment
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-align]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateSelectedElement();
      });
    });

    // Position inputs
    ['elementX', 'elementY', 'elementW', 'elementH', 'elementRotation'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.updateElementPosition());
        el.addEventListener('change', () => this.updateElementPosition());
      }
    });

    // Image upload - use unified picker
    document.getElementById('uploadImageBtn')?.addEventListener('click', () => {
      if (this.selectedElement && this.selectedElement.type === 'image') {
        this.openImagePicker(this.selectedElement, 'Select Image for Element');
      } else {
        this.openImagePicker('element', 'Select Image');
      }
    });

    // Legacy image upload (fallback)
    document.getElementById('imageUpload')?.addEventListener('change', (e) => {
      this.handleImageUpload(e.target.files[0]);
    });

    // AI Image button - use unified picker with AI tab
    document.getElementById('aiImageBtn')?.addEventListener('click', () => {
      if (this.selectedElement && this.selectedElement.type === 'image') {
        this.openImagePicker(this.selectedElement, 'Generate AI Image');
      } else {
        this.openImagePicker('element', 'Generate AI Image');
      }
      // Switch to AI tab
      setTimeout(() => {
        document.querySelector('.picker-tab[data-tab="ai"]')?.click();
      }, 100);
    });

    // Image properties
    ['imageWidth', 'imageHeight', 'imageOpacity', 'imageBorderRadius'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateSelectedElement();
          // Update value displays
          if (id === 'imageOpacity') {
            document.getElementById('opacityValue').textContent = el.value + '%';
          }
          if (id === 'imageBorderRadius') {
            document.getElementById('borderRadiusValue').textContent = el.value + '%';
          }
        });
      }
    });

    // Fit mode buttons for images
    document.querySelectorAll('.fit-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.fit-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update selected image element
        if (this.selectedElement && this.selectedElement.type === 'image') {
          this.selectedElement.objectFit = btn.dataset.fit;
          this.render();
          this.saveState();
          this.markUnsaved();
        }
      });
    });

    // Shape properties
    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.updateSelectedElement();
      });
    });

    ['shapeFill', 'shapeStroke', 'shapeStrokeWidth', 'shapeOpacity', 'shapeBorderRadius'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateSelectedElement();
          if (id === 'shapeStrokeWidth') {
            document.getElementById('strokeWidthValue').textContent = el.value;
          }
          if (id === 'shapeOpacity') {
            document.getElementById('shapeOpacityValue').textContent = el.value + '%';
          }
          if (id === 'shapeBorderRadius') {
            document.getElementById('shapeBorderRadiusValue').textContent = el.value;
          }
        });
      }
    });

    // Text background and border properties
    ['textBackgroundColor', 'textBackgroundOpacity', 'textBorderColor', 'textBorderWidth', 'textBorderRadius', 'textPadding'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateSelectedElement();
          if (id === 'textBackgroundOpacity') {
            document.getElementById('textBgOpacityValue').textContent = el.value + '%';
          }
          if (id === 'textBorderWidth') {
            document.getElementById('textBorderWidthValue').textContent = el.value;
          }
          if (id === 'textBorderRadius') {
            document.getElementById('textBorderRadiusValue').textContent = el.value;
          }
          if (id === 'textPadding') {
            document.getElementById('textPaddingValue').textContent = el.value;
          }
        });
      }
    });

    // Text stroke (outline) properties
    ['textStrokeColor', 'textStrokeWidth'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateSelectedElement();
          if (id === 'textStrokeWidth') {
            document.getElementById('textStrokeWidthValue').textContent = el.value;
          }
        });
      }
    });

    // Image stroke properties
    ['imageStrokeColor', 'imageStrokeWidth'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateSelectedElement();
          if (id === 'imageStrokeWidth') {
            document.getElementById('imageStrokeWidthValue').textContent = el.value;
          }
        });
      }
    });

    // Rotation value display
    document.getElementById('elementRotation')?.addEventListener('input', (e) => {
      document.getElementById('rotationValue').textContent = `${e.target.value}°`;
    });

    // Text width toggle (Auto vs Fixed)
    document.getElementById('autoWidthBtn')?.addEventListener('click', () => {
      document.getElementById('autoWidthBtn').classList.add('active');
      document.getElementById('fixedWidthBtn').classList.remove('active');
      document.getElementById('fixedWidthInput').style.display = 'none';

      if (this.selectedElement && this.selectedElement.type === 'text') {
        this.selectedElement.autoWidth = true;
        this.autoFitTextWidth(this.selectedElement);
        this.render();
        this.updateHandles();
      }
    });

    document.getElementById('fixedWidthBtn')?.addEventListener('click', () => {
      document.getElementById('fixedWidthBtn').classList.add('active');
      document.getElementById('autoWidthBtn').classList.remove('active');
      document.getElementById('fixedWidthInput').style.display = 'block';

      if (this.selectedElement && this.selectedElement.type === 'text') {
        this.selectedElement.autoWidth = false;
        document.getElementById('textWidth').value = Math.round(this.selectedElement.width);
      }
    });

    document.getElementById('textWidth')?.addEventListener('input', (e) => {
      if (this.selectedElement && this.selectedElement.type === 'text') {
        this.selectedElement.width = parseInt(e.target.value) || 100;
        this.selectedElement.autoWidth = false;
        this.render();
        this.updateHandles();
      }
    });
  }

  setupBackgroundListeners() {
    // Background type buttons
    document.querySelectorAll('.bg-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const type = btn.dataset.bgType;
        document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
        document.getElementById(`bg${type.charAt(0).toUpperCase() + type.slice(1)}Options`).classList.add('active');

        this.background.type = type;
        this.render();
      });
    });

    // Background color
    document.getElementById('bgColor')?.addEventListener('input', (e) => {
      this.background.type = 'color';
      this.background.value = e.target.value;
      this.render();
    });

    // Gradient
    ['gradientStart', 'gradientEnd', 'gradientDirection'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        this.background.type = 'gradient';
        this.background.value = {
          start: document.getElementById('gradientStart').value,
          end: document.getElementById('gradientEnd').value,
          direction: document.getElementById('gradientDirection').value
        };
        this.render();
      });
    });

    // Preset colors
    document.querySelectorAll('.preset-color').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        if (color) {
          this.background.type = 'color';
          this.background.value = color;
          document.getElementById('bgColor').value = color;
          this.render();
        }
      });
    });

    // Select Background button - opens unified image picker
    document.getElementById('selectBgBtn')?.addEventListener('click', () => {
      this.openImagePicker('background', 'Select Background');
    });

    // Legacy background upload (fallback)
    document.getElementById('bgImageUpload')?.addEventListener('change', (e) => {
      this.handleBackgroundUpload(e.target.files[0]);
    });

    // Remove background
    document.getElementById('removeBgBtn')?.addEventListener('click', () => {
      this.background.type = 'color';
      this.background.value = '#f5f5f5';
      this.background.image = null;
      this.background.fitMode = 'cover';
      this.background.blur = 0;
      document.getElementById('bgPreview').classList.add('hidden');
      document.getElementById('bgFitOptions').classList.add('hidden');
      document.getElementById('bgBlurOption').classList.add('hidden');
      document.getElementById('bgColor').value = '#f5f5f5';
      this.render();
    });

    // Background fit mode buttons
    document.querySelectorAll('.bg-fit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-fit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.background.fitMode = btn.dataset.fit;
        this.render();
        this.saveState();
        this.markUnsaved();
      });
    });

    // Background blur slider
    document.getElementById('bgBlur')?.addEventListener('input', (e) => {
      const blur = parseInt(e.target.value);
      this.background.blur = blur;
      document.getElementById('bgBlurValue').textContent = blur + 'px';
      this.render();
      this.markUnsaved();
    });
  }

  // ==================== BACKGROUND LIBRARY ====================

  openBackgroundLibrary() {
    this.bgLibraryPage = 1;
    this.bgLibrarySearch = '';
    this.bgLibraryCategory = '';
    this.bgLibraryOccasion = '';

    document.getElementById('bgLibraryModal').classList.add('show');
    document.getElementById('bgLibrarySearch').value = '';
    document.getElementById('bgLibraryCategory').value = '';
    document.getElementById('bgLibraryOccasion').value = '';

    this.loadBackgroundLibrary();
    this.setupBackgroundLibraryListeners();
  }

  setupBackgroundLibraryListeners() {
    // Search input with debounce
    const searchInput = document.getElementById('bgLibrarySearch');
    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.bgLibrarySearch = e.target.value;
        this.bgLibraryPage = 1;
        this.loadBackgroundLibrary();
      }, 300);
    });

    // Category filter
    document.getElementById('bgLibraryCategory')?.addEventListener('change', (e) => {
      this.bgLibraryCategory = e.target.value;
      this.bgLibraryPage = 1;
      this.loadBackgroundLibrary();
    });

    // Occasion filter
    document.getElementById('bgLibraryOccasion')?.addEventListener('change', (e) => {
      this.bgLibraryOccasion = e.target.value;
      this.bgLibraryPage = 1;
      this.loadBackgroundLibrary();
    });

    // Pagination
    document.getElementById('bgLibraryPrev')?.addEventListener('click', () => {
      if (this.bgLibraryPage > 1) {
        this.bgLibraryPage--;
        this.loadBackgroundLibrary();
      }
    });

    document.getElementById('bgLibraryNext')?.addEventListener('click', () => {
      this.bgLibraryPage++;
      this.loadBackgroundLibrary();
    });

    // Generate from library button
    document.getElementById('generateFromLibraryBtn')?.addEventListener('click', () => {
      this.closeModals();
      document.getElementById('aiBgModal').classList.add('show');
    });

    // Open AI generator button
    document.getElementById('openAiGeneratorBtn')?.addEventListener('click', () => {
      this.closeModals();
      document.getElementById('aiBgModal').classList.add('show');
    });
  }

  async loadBackgroundLibrary() {
    const loading = document.getElementById('bgLibraryLoading');
    const empty = document.getElementById('bgLibraryEmpty');
    const grid = document.getElementById('bgLibraryGrid');
    const pagination = document.getElementById('bgLibraryPagination');

    loading.classList.remove('hidden');
    empty.classList.add('hidden');
    grid.classList.add('hidden');
    pagination.classList.add('hidden');

    try {
      let url;
      const limit = 12;

      if (this.bgLibrarySearch) {
        // Use search endpoint
        url = `http://localhost:3001/api/backgrounds/search?q=${encodeURIComponent(this.bgLibrarySearch)}&limit=${limit}`;
        if (this.bgLibraryCategory) url += `&category=${this.bgLibraryCategory}`;
        if (this.bgLibraryOccasion) url += `&occasion=${this.bgLibraryOccasion}`;
      } else {
        // Use list endpoint
        url = `http://localhost:3001/api/backgrounds/list?page=${this.bgLibraryPage}&limit=${limit}`;
        if (this.bgLibraryCategory) url += `&category=${this.bgLibraryCategory}`;
      }

      const response = await fetch(url);
      const data = await response.json();

      loading.classList.add('hidden');

      const backgrounds = data.backgrounds || data.results || [];

      if (backgrounds.length === 0) {
        empty.classList.remove('hidden');
        return;
      }

      grid.classList.remove('hidden');
      pagination.classList.remove('hidden');

      this.renderBackgroundLibrary(backgrounds);

      // Update pagination info
      const pageInfo = document.getElementById('bgLibraryPageInfo');
      const totalPages = data.pagination?.totalPages || Math.ceil((data.total || backgrounds.length) / limit);
      pageInfo.textContent = `Page ${this.bgLibraryPage} of ${totalPages || 1}`;

      // Enable/disable pagination buttons
      document.getElementById('bgLibraryPrev').disabled = this.bgLibraryPage <= 1;
      document.getElementById('bgLibraryNext').disabled = this.bgLibraryPage >= totalPages;

    } catch (error) {
      console.error('Failed to load backgrounds:', error);
      loading.classList.add('hidden');
      empty.classList.remove('hidden');
      this.showToast('Failed to load backgrounds from library', 'error');
    }
  }

  renderBackgroundLibrary(backgrounds) {
    const grid = document.getElementById('bgLibraryGrid');

    grid.innerHTML = backgrounds.map(bg => {
      const imageUrl = bg.location?.url
        ? `http://localhost:3001${bg.location.url}`
        : `http://localhost:3001/api/backgrounds/image/${bg.imagePath || bg.filename}`;

      const name = bg.prompt || bg.name || 'Background';
      const category = bg.category || 'general';

      return `
        <div class="library-item" data-url="${imageUrl}" data-name="${name}">
          <img src="${imageUrl}" alt="${name}" loading="lazy">
          <div class="library-item-overlay">
            <span class="library-item-name">${name}</span>
            <span class="library-item-category">${category}</span>
          </div>
          <div class="library-item-select">
            <i class="fas fa-check"></i>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners
    grid.querySelectorAll('.library-item').forEach(item => {
      item.addEventListener('click', () => {
        const url = item.dataset.url;
        this.selectBackgroundFromLibrary(url);
      });
    });
  }

  selectBackgroundFromLibrary(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.background.type = 'image';
      this.background.value = url;
      this.background.image = img;

      // Update preview
      document.getElementById('bgPreview').classList.remove('hidden');
      document.getElementById('bgPreviewImg').src = url;

      // Show fit and blur options
      document.getElementById('bgFitOptions').classList.remove('hidden');
      document.getElementById('bgBlurOption').classList.remove('hidden');

      // Switch to image background type in UI
      document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.bg-type-btn[data-bg-type="image"]')?.classList.add('active');
      document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
      document.getElementById('bgImageOptions')?.classList.add('active');

      this.render();
      this.saveState();
      this.closeModals();
      this.showToast('Background applied successfully!', 'success');
    };
    img.onerror = () => {
      this.showToast('Failed to load background image', 'error');
    };
    img.src = url;
  }

  setupModalListeners() {
    // Close modals
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => this.closeModals());
    });

    // Export modal format selection
    document.querySelectorAll('.format-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.format-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
      });
    });

    document.getElementById('exportQuality')?.addEventListener('input', (e) => {
      document.getElementById('qualityValue').textContent = `${e.target.value}%`;
    });

    document.getElementById('downloadBtn')?.addEventListener('click', () => this.downloadImage());

    // Placeholder modal
    document.getElementById('placeholderName')?.addEventListener('input', (e) => {
      const name = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      document.getElementById('placeholderPreviewText').textContent = `{{${name || 'placeholder_name'}}}`;
    });

    document.getElementById('savePlaceholderBtn')?.addEventListener('click', () => this.savePlaceholder());

    // AI Background modal
    document.getElementById('searchBgBtn')?.addEventListener('click', () => this.searchBackgrounds());
    document.getElementById('generateBgBtn')?.addEventListener('click', () => this.generateBackground());
  }

  setupDynamicToggleListeners() {
    document.querySelectorAll('.dynamic-toggle').forEach(btn => {
      btn.addEventListener('click', () => this.handleDynamicToggle(btn));
    });

    // Add placeholder button
    document.getElementById('addPlaceholderBtn')?.addEventListener('click', () => {
      this.pendingPlaceholder = { property: 'custom', elementId: null };
      this.showPlaceholderModal();
    });
  }

  // ==================== PLACEHOLDER SYSTEM ====================

  handleDynamicToggle(btn) {
    const property = btn.dataset.property;
    console.log('Dynamic toggle clicked for property:', property);

    // Background properties don't need element selection
    const isBackgroundProperty = ['bgColor', 'bgImage'].includes(property);

    if (!this.selectedElement && !isBackgroundProperty) {
      this.showToast('Select an element first', 'warning');
      return;
    }

    const elementId = isBackgroundProperty ? 'background' : this.selectedElement.id;

    // Check if already dynamic
    if (btn.classList.contains('active')) {
      // Remove placeholder
      this.removePlaceholderForProperty(property, elementId);
      btn.classList.remove('active');
      this.updateDynamicInputStyle(property, false);
      this.showToast('Placeholder removed', 'info');
    } else {
      // Create new placeholder
      this.pendingPlaceholder = {
        property: property,
        elementId: elementId
      };
      console.log('Opening placeholder modal for:', this.pendingPlaceholder);
      this.showPlaceholderModal(property);
    }
  }

  showPlaceholderModal(property = '') {
    const nameInput = document.getElementById('placeholderName');
    const defaultInput = document.getElementById('placeholderDefault');
    const previewText = document.getElementById('placeholderPreviewText');
    const modal = document.getElementById('placeholderModal');
    const saveBtn = document.getElementById('savePlaceholderBtn');

    if (!nameInput || !modal) {
      console.error('Placeholder modal elements not found');
      return;
    }

    // Reset editing state when opening for new placeholder
    this.editingPlaceholderName = null;

    // Reset button text
    if (saveBtn) {
      saveBtn.innerHTML = '<i class="fas fa-check"></i> Create Placeholder';
    }

    // Suggest a default name based on property
    const suggestedNames = {
      'text': 'content',
      'src': 'image_url',
      'color': 'text_color',
      'fontSize': 'font_size',
      'fill': 'fill_color',
      'stroke': 'stroke_color',
      'bgColor': 'bg_color',
      'bgImage': 'bg_image',
      'opacity': 'opacity',
      'x': 'position_x',
      'y': 'position_y',
      'width': 'width',
      'height': 'height'
    };

    const suggestedName = suggestedNames[property] || property || '';

    nameInput.value = suggestedName;
    if (defaultInput) defaultInput.value = '';
    previewText.textContent = `{{${suggestedName || 'placeholder_name'}}}`;

    modal.classList.add('show');

    // Focus the name input
    setTimeout(() => nameInput.focus(), 100);
  }

  savePlaceholder() {
    const nameInput = document.getElementById('placeholderName');
    const defaultInput = document.getElementById('placeholderDefault');
    const typeSelect = document.getElementById('placeholderType');

    if (!nameInput) {
      console.error('Placeholder name input not found');
      return;
    }

    const defaultValue = defaultInput?.value || '';
    let newName = nameInput.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');

    if (!newName) {
      this.showToast('Please enter a placeholder name', 'error');
      nameInput.focus();
      return;
    }

    // Check if we're editing an existing placeholder
    const isEditing = !!this.editingPlaceholderName;
    const oldName = this.editingPlaceholderName;

    if (isEditing) {
      // Editing existing placeholder
      const existingPlaceholder = this.placeholders[oldName];
      if (!existingPlaceholder) {
        this.showToast('Placeholder not found', 'error');
        this.closeModals();
        return;
      }

      // Check for duplicate name (if name changed)
      if (newName !== oldName && this.placeholders[newName]) {
        this.showToast('Placeholder name already exists. Choose a different name.', 'error');
        nameInput.focus();
        return;
      }

      const property = existingPlaceholder.property;
      const elementId = existingPlaceholder.elementId;
      const newType = typeSelect?.value || existingPlaceholder.type;

      // Update the placeholder
      const updatedPlaceholder = {
        name: newName,
        type: newType,
        property: property,
        elementId: elementId,
        defaultValue: defaultValue || existingPlaceholder.defaultValue
      };

      // If name changed, delete old and create new
      if (newName !== oldName) {
        delete this.placeholders[oldName];

        // Update element references
        if (elementId === 'background') {
          this.background.placeholder = newName;
        } else {
          const element = this.elements.find(el => el.id === elementId);
          if (element && element.dynamicProperties && element.dynamicProperties[property]) {
            element.dynamicProperties[property].placeholder = newName;
          }
          // Update text if it's a text property
          if (property === 'text' && element) {
            element.text = `{{${newName}}}`;
          }
        }
      }

      this.placeholders[newName] = updatedPlaceholder;

      this.closeModals();
      this.render();
      this.renderPlaceholders();
      this.renderLayers();
      this.updateSelectedElementProperties();
      this.saveState();
      this.showToast(`Placeholder {{${newName}}} updated`, 'success');

      // Reset editing state
      this.editingPlaceholderName = null;

      // Reset button text
      const saveBtn = document.getElementById('savePlaceholderBtn');
      if (saveBtn) {
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Create Placeholder';
      }
      return;
    }

    // Creating new placeholder
    if (!this.pendingPlaceholder) {
      this.showToast('No property selected', 'error');
      this.closeModals();
      return;
    }

    const property = this.pendingPlaceholder.property;
    const elementId = this.pendingPlaceholder.elementId;

    // Check for duplicate (only if it's for a different element)
    if (this.placeholders[newName]) {
      const existing = this.placeholders[newName];
      if (existing.elementId !== elementId || existing.property !== property) {
        this.showToast('Placeholder name already exists. Choose a different name.', 'error');
        nameInput.focus();
        return;
      }
    }

    // Determine type based on property
    let type = typeSelect?.value || 'text';
    if (!typeSelect?.value) {
      if (['src', 'bgImage'].includes(property)) type = 'image';
      else if (['color', 'fill', 'stroke', 'bgColor'].includes(property)) type = 'color';
      else if (['x', 'y', 'width', 'height', 'fontSize', 'opacity', 'shapeOpacity'].includes(property)) type = 'number';
    }

    // Get current value as default
    let currentValue = defaultValue;
    if (!currentValue) {
      if (elementId === 'background') {
        currentValue = this.background.value || '';
      } else {
        const element = this.elements.find(el => el.id === elementId);
        if (element) {
          currentValue = element[property] !== undefined ? String(element[property]) : '';
        }
      }
    }

    // Create placeholder
    this.placeholders[newName] = {
      name: newName,
      type: type,
      property: property,
      elementId: elementId,
      defaultValue: currentValue
    };

    console.log('Created placeholder:', this.placeholders[newName]);

    // Update element or background
    if (elementId === 'background') {
      this.background.isDynamic = true;
      this.background.placeholder = newName;
    } else {
      const element = this.elements.find(el => el.id === elementId);
      if (element) {
        if (!element.dynamicProperties) {
          element.dynamicProperties = {};
        }
        element.dynamicProperties[property] = {
          isDynamic: true,
          placeholder: newName
        };

        // For text property, update the text to show placeholder
        if (property === 'text') {
          element.text = `{{${newName}}}`;
        }
      }
    }

    // Update UI
    const toggleBtn = document.querySelector(`.dynamic-toggle[data-property="${property}"]`);
    if (toggleBtn) {
      toggleBtn.classList.add('active');
    }
    this.updateDynamicInputStyle(property, true, newName);

    this.closeModals();
    this.render();
    this.renderPlaceholders();
    this.renderLayers();
    this.updateSelectedElementProperties();
    this.saveState();
    this.showToast(`Placeholder {{${newName}}} created`, 'success');

    this.pendingPlaceholder = null;
  }

  removePlaceholderForProperty(property, elementId = null) {
    // Use provided elementId or get from selected element
    const targetElementId = elementId || this.selectedElement?.id || 'background';
    let removedPlaceholder = null;

    // Find and remove placeholder
    for (const [name, placeholder] of Object.entries(this.placeholders)) {
      if (placeholder.property === property && placeholder.elementId === targetElementId) {
        removedPlaceholder = { ...placeholder, name };
        delete this.placeholders[name];
        break;
      }
    }

    // Update element
    if (targetElementId === 'background') {
      this.background.isDynamic = false;
      this.background.placeholder = null;
    } else {
      const element = this.elements.find(el => el.id === targetElementId);
      if (element && element.dynamicProperties) {
        delete element.dynamicProperties[property];

        // For text property, restore default text
        if (property === 'text' && removedPlaceholder) {
          element.text = removedPlaceholder.defaultValue || 'Text';
        }
      }
    }

    this.render();
    this.renderPlaceholders();
    this.renderLayers();
    this.updateSelectedElementProperties();
    this.saveState();
  }

  updateDynamicInputStyle(property, isDynamic, placeholderName = '') {
    // Find the input wrapper for this property
    const inputMappings = {
      'text': 'textContentWrapper',
      'color': null, // Just toggle button
      'fontSize': null,
      'src': null,
      'bgColor': null,
      'bgImage': null
    };

    const wrapperId = inputMappings[property];
    if (wrapperId) {
      const wrapper = document.getElementById(wrapperId);
      if (wrapper) {
        if (isDynamic) {
          wrapper.classList.add('is-dynamic');
        } else {
          wrapper.classList.remove('is-dynamic');
        }
      }
    }
  }

  renderPlaceholders() {
    const list = document.getElementById('placeholdersList');
    const empty = document.getElementById('placeholderEmpty');

    const placeholderNames = Object.keys(this.placeholders);

    if (placeholderNames.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }

    empty.classList.add('hidden');

    list.innerHTML = placeholderNames.map(name => {
      const p = this.placeholders[name];
      const icon = p.type === 'image' ? 'image' : p.type === 'color' ? 'palette' : p.type === 'number' ? 'hashtag' : 'font';

      return `
        <div class="placeholder-item" data-name="${name}">
          <div class="placeholder-icon">
            <i class="fas fa-${icon}"></i>
          </div>
          <div class="placeholder-info">
            <span class="placeholder-name">${name}</span>
            <span class="placeholder-type">${p.type} - ${p.property}</span>
          </div>
          <div class="placeholder-actions">
            <button class="btn-icon btn-icon-sm" data-action="edit" title="Edit">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn-icon btn-icon-sm" data-action="delete" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Event listeners for placeholder actions
    list.querySelectorAll('.placeholder-item').forEach(item => {
      const name = item.dataset.name;

      item.querySelector('[data-action="edit"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.editPlaceholder(name);
      });

      item.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePlaceholder(name);
      });

      item.addEventListener('click', () => {
        // Highlight the element that uses this placeholder
        const placeholder = this.placeholders[name];
        if (placeholder.elementId !== 'background') {
          const element = this.elements.find(el => el.id === placeholder.elementId);
          if (element) {
            this.selectElement(element);
            this.render();
          }
        }
      });
    });
  }

  editPlaceholder(name) {
    const placeholder = this.placeholders[name];
    if (!placeholder) return;

    // Store the current placeholder being edited
    this.editingPlaceholderName = name;

    // Open the placeholder modal with existing values
    const modal = document.getElementById('placeholderModal');
    const nameInput = document.getElementById('placeholderName');
    const typeSelect = document.getElementById('placeholderType');
    const defaultInput = document.getElementById('placeholderDefault');
    const previewText = document.getElementById('placeholderPreviewText');
    const saveBtn = document.getElementById('savePlaceholderBtn');

    if (!modal || !nameInput) {
      console.error('Placeholder modal elements not found');
      return;
    }

    // Fill in existing values
    nameInput.value = name;
    if (typeSelect) typeSelect.value = placeholder.type || 'text';
    if (defaultInput) defaultInput.value = placeholder.defaultValue || '';
    previewText.textContent = `{{${name}}}`;

    // Change button text to indicate editing
    if (saveBtn) {
      saveBtn.innerHTML = '<i class="fas fa-check"></i> Update Placeholder';
    }

    // Show modal (use 'show' class like showPlaceholderModal)
    modal.classList.add('show');

    // Focus the name input
    setTimeout(() => nameInput.focus(), 100);
  }

  deletePlaceholder(name) {
    const placeholder = this.placeholders[name];
    if (!placeholder) return;

    // Remove from element
    if (placeholder.elementId === 'background') {
      this.background.isDynamic = false;
      this.background.placeholder = null;
    } else {
      const element = this.elements.find(el => el.id === placeholder.elementId);
      if (element && element.dynamicProperties) {
        delete element.dynamicProperties[placeholder.property];

        // For text property, restore default text
        if (placeholder.property === 'text') {
          element.text = placeholder.defaultValue || 'Text';
        }
      }
    }

    // Update toggle button if element is selected
    if (this.selectedElement?.id === placeholder.elementId) {
      const toggleBtn = document.querySelector(`.dynamic-toggle[data-property="${placeholder.property}"]`);
      if (toggleBtn) {
        toggleBtn.classList.remove('active');
      }
      this.updateDynamicInputStyle(placeholder.property, false);
    }

    delete this.placeholders[name];
    this.render();
    this.renderPlaceholders();
    this.renderLayers();
    this.updateSelectedElementProperties();
    this.saveState();
    this.showToast(`Placeholder {{${name}}} deleted`, 'success');
  }

  getPlaceholdersArray() {
    return Object.values(this.placeholders);
  }

  // ==================== TOOL HANDLING ====================

  selectTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });

    if (tool !== 'select') {
      this.deselectElement();
    }
  }

  handleAction(action) {
    switch (action) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'zoom-in':
        this.zoom = Math.min(this.zoom * 1.25, 3);
        this.applyZoom();
        break;
      case 'zoom-out':
        this.zoom = Math.max(this.zoom * 0.8, 0.25);
        this.applyZoom();
        break;
      case 'fit':
        this.fitToScreen();
        break;
      case 'delete':
        if (this.selectedElement) {
          this.deleteSelectedElement();
        }
        break;
    }
  }

  // ==================== CANVAS INTERACTIONS ====================

  handleMouseDown(e) {
    const pos = this.getCanvasPosition(e);
    const isShiftHeld = e.shiftKey;
    const isCtrlHeld = e.ctrlKey || e.metaKey;

    if (this.currentTool === 'select') {
      const element = this.getElementAtPosition(pos.x, pos.y);

      if (element) {
        // Shift+click: Add/remove from multi-selection
        if (isShiftHeld || isCtrlHeld) {
          this.toggleElementSelection(element);
        } else {
          // Check if clicking on already selected element in multi-selection
          if (this.selectedElements.includes(element)) {
            // Start dragging all selected elements
            this.isDragging = true;
            this.dragStart = { x: pos.x, y: pos.y };
            // Store initial positions of all selected elements
            this.dragInitialPositions = this.selectedElements.map(el => ({
              element: el,
              x: el.x,
              y: el.y
            }));
          } else {
            // Single click on new element - clear multi-selection
            this.clearMultiSelection();
            this.selectElement(element);
            this.isDragging = true;
            this.dragStart = { x: pos.x, y: pos.y };
            this.dragInitialPositions = [{ element: element, x: element.x, y: element.y }];
          }
        }
      } else {
        // Clicked on empty space - start selection box (marquee)
        if (!isShiftHeld && !isCtrlHeld) {
          this.clearMultiSelection();
          this.deselectElement();
        }
        this.isSelecting = true;
        this.selectionStart = { x: pos.x, y: pos.y };
        this.selectionBox = { x: pos.x, y: pos.y, width: 0, height: 0 };
      }
    } else if (this.currentTool === 'text') {
      this.addTextElement(pos.x, pos.y);
      this.selectTool('select');
    } else if (this.currentTool === 'shape') {
      this.addShapeElement(pos.x, pos.y);
      this.selectTool('select');
    } else if (this.currentTool === 'image') {
      document.getElementById('imageUpload').click();
      this.selectTool('select');
    }
  }

  handleMouseMove(e) {
    const pos = this.getCanvasPosition(e);

    // Handle dragging multiple elements
    if (this.isDragging && this.dragInitialPositions) {
      const deltaX = pos.x - this.dragStart.x;
      const deltaY = pos.y - this.dragStart.y;

      // Move all selected elements
      this.dragInitialPositions.forEach(({ element, x, y }) => {
        element.x = x + deltaX;
        element.y = y + deltaY;
      });

      this.render();
      this.updateHandles();
      this.updatePositionInputs();
    }

    // Handle selection box drawing (marquee select)
    if (this.isSelecting && this.selectionBox) {
      const x = Math.min(this.selectionStart.x, pos.x);
      const y = Math.min(this.selectionStart.y, pos.y);
      const width = Math.abs(pos.x - this.selectionStart.x);
      const height = Math.abs(pos.y - this.selectionStart.y);

      this.selectionBox = { x, y, width, height };
      this.render();
      this.drawSelectionBox();
    }
  }

  handleMouseUp() {
    // Finish dragging
    if (this.isDragging) {
      this.saveState();
    }
    this.isDragging = false;
    this.dragInitialPositions = null;

    // Finish selection box - select all elements inside
    if (this.isSelecting && this.selectionBox) {
      this.selectElementsInBox(this.selectionBox);
      this.selectionBox = null;
      this.render();
    }
    this.isSelecting = false;
  }

  // Multi-select helper methods
  toggleElementSelection(element) {
    const index = this.selectedElements.indexOf(element);
    if (index === -1) {
      // Add to selection
      this.selectedElements.push(element);
      this.selectedElement = element;
    } else {
      // Remove from selection
      this.selectedElements.splice(index, 1);
      if (this.selectedElement === element) {
        this.selectedElement = this.selectedElements.length > 0 ? this.selectedElements[this.selectedElements.length - 1] : null;
      }
    }
    this.render();
    this.updateHandles();
    this.renderLayers();
    this.updateMultiSelectInfo();
  }

  clearMultiSelection() {
    this.selectedElements = [];
    this.updateMultiSelectInfo();
  }

  selectElementsInBox(box) {
    const elementsInBox = this.elements.filter(el => {
      // Get element bounds (x, y is center)
      const elWidth = el.width || 100;
      const elHeight = el.height || (el.type === 'text' ? this.measureTextHeight(el) : 100);
      const elLeft = el.x - elWidth / 2;
      const elRight = el.x + elWidth / 2;
      const elTop = el.y - elHeight / 2;
      const elBottom = el.y + elHeight / 2;

      // Check if element intersects with selection box
      return !(elRight < box.x || elLeft > box.x + box.width ||
               elBottom < box.y || elTop > box.y + box.height);
    });

    if (elementsInBox.length > 0) {
      this.selectedElements = elementsInBox;
      this.selectedElement = elementsInBox[elementsInBox.length - 1];
      this.loadElementProperties(this.selectedElement);
      this.updateHandles();
      this.renderLayers();
      this.updateMultiSelectInfo();
    }
  }

  drawSelectionBox() {
    if (!this.selectionBox) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.zoom, this.zoom);

    // Draw selection box
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 1 / this.zoom;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(this.selectionBox.x, this.selectionBox.y, this.selectionBox.width, this.selectionBox.height);

    // Fill with semi-transparent blue
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
    ctx.fillRect(this.selectionBox.x, this.selectionBox.y, this.selectionBox.width, this.selectionBox.height);

    ctx.restore();
  }

  updateMultiSelectInfo() {
    // Show multi-select info in UI
    const count = this.selectedElements.length;
    const statusEl = document.getElementById('multiSelectStatus');
    if (statusEl) {
      if (count > 1) {
        statusEl.textContent = `${count} elements selected`;
        statusEl.style.display = 'block';
      } else {
        statusEl.style.display = 'none';
      }
    }
  }

  // ==================== RESIZE HANDLING ====================

  handleResizeStart(e, handleType) {
    if (!this.selectedElement) return;

    e.preventDefault();
    e.stopPropagation();

    this.isResizing = true;
    this.resizeHandle = handleType;

    const el = this.selectedElement;
    const rect = this.canvas.getBoundingClientRect();

    this.resizeStart = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: el.width || 100,
      height: el.type === 'text' ? this.measureTextHeight(el) : (el.height || 100),
      elX: el.x,
      elY: el.y,
      fontSize: el.fontSize || 48 // Store for text scaling
    };
  }

  handleResizeMove(e) {
    if (!this.isResizing || !this.selectedElement) return;

    const el = this.selectedElement;
    const deltaX = (e.clientX - this.resizeStart.mouseX) / this.zoom;
    const deltaY = (e.clientY - this.resizeStart.mouseY) / this.zoom;

    let newWidth = this.resizeStart.width;
    let newHeight = this.resizeStart.height;

    // Text elements: PowerPoint-style resizing
    if (el.type === 'text') {
      const isCornerHandle = ['se', 'sw', 'ne', 'nw'].includes(this.resizeHandle);

      if (isCornerHandle) {
        // Corner handles: Scale font size proportionally (like PowerPoint)
        const startFontSize = this.resizeStart.fontSize || el.fontSize;

        // Calculate scale based on diagonal movement
        let scale = 1;
        if (this.resizeHandle === 'se') {
          scale = 1 + (deltaX + deltaY) / 200;
        } else if (this.resizeHandle === 'nw') {
          scale = 1 + (-deltaX - deltaY) / 200;
        } else if (this.resizeHandle === 'ne') {
          scale = 1 + (deltaX - deltaY) / 200;
        } else if (this.resizeHandle === 'sw') {
          scale = 1 + (-deltaX + deltaY) / 200;
        }

        // Apply new font size (min 8px, max 500px)
        const newFontSize = Math.max(8, Math.min(500, Math.round(startFontSize * scale)));
        el.fontSize = newFontSize;

        // Auto-fit width to new text size
        this.ctx.font = `${el.fontWeight || 'normal'} ${el.fontSize}px ${el.fontFamily}`;
        const lines = (el.text || '').split('\n');
        let maxWidth = 0;
        lines.forEach(line => {
          const w = this.ctx.measureText(line).width;
          if (w > maxWidth) maxWidth = w;
        });
        el.width = Math.max(50, maxWidth + 20);
        el.autoWidth = true;

      } else if (this.resizeHandle === 'e' || this.resizeHandle === 'w') {
        // Side handles: Only change text box width (affects wrapping)
        if (this.resizeHandle === 'e') {
          newWidth = Math.max(50, this.resizeStart.width + deltaX * 2);
        } else {
          newWidth = Math.max(50, this.resizeStart.width - deltaX * 2);
        }
        el.width = newWidth;
        el.autoWidth = false; // Manual width set

      }
      // Top/bottom handles do nothing for text (height is auto)

    } else {
      // Images and shapes: Standard resize behavior
      const isCornerHandle = ['se', 'sw', 'ne', 'nw'].includes(this.resizeHandle);
      const shiftHeld = e.shiftKey;

      switch (this.resizeHandle) {
        case 'e':
          newWidth = Math.max(20, this.resizeStart.width + deltaX * 2);
          break;
        case 'w':
          newWidth = Math.max(20, this.resizeStart.width - deltaX * 2);
          break;
        case 's':
          newHeight = Math.max(20, this.resizeStart.height + deltaY * 2);
          break;
        case 'n':
          newHeight = Math.max(20, this.resizeStart.height - deltaY * 2);
          break;
        case 'se':
          newWidth = Math.max(20, this.resizeStart.width + deltaX * 2);
          newHeight = Math.max(20, this.resizeStart.height + deltaY * 2);
          break;
        case 'sw':
          newWidth = Math.max(20, this.resizeStart.width - deltaX * 2);
          newHeight = Math.max(20, this.resizeStart.height + deltaY * 2);
          break;
        case 'ne':
          newWidth = Math.max(20, this.resizeStart.width + deltaX * 2);
          newHeight = Math.max(20, this.resizeStart.height - deltaY * 2);
          break;
        case 'nw':
          newWidth = Math.max(20, this.resizeStart.width - deltaX * 2);
          newHeight = Math.max(20, this.resizeStart.height - deltaY * 2);
          break;
      }

      // For corner handles with Shift: maintain aspect ratio
      if (isCornerHandle && shiftHeld) {
        const aspectRatio = this.resizeStart.width / this.resizeStart.height;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          newHeight = newWidth / aspectRatio;
        } else {
          newWidth = newHeight * aspectRatio;
        }
      }

      el.width = newWidth;
      el.height = newHeight;
    }

    this.render();
    this.updateHandles();
    this.loadElementProperties(el);
  }

  handleResizeEnd() {
    if (this.isResizing) {
      this.saveState();
    }
    this.isResizing = false;
    this.resizeHandle = null;
  }

  handleDoubleClick(e) {
    const pos = this.getCanvasPosition(e);
    const element = this.getElementAtPosition(pos.x, pos.y);

    if (element && element.type === 'text') {
      this.selectElement(element);
      document.getElementById('textContent').focus();
      document.getElementById('textContent').select();
    }
  }

  handleKeyDown(e) {
    // Ignore when typing in inputs
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      // Allow Delete/Backspace for text inputs
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      return;
    }

    // Delete selected element
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedElement) {
      e.preventDefault();
      this.deleteSelectedElement();
    }

    // Ctrl/Cmd shortcuts
    if (e.ctrlKey || e.metaKey) {
      // Undo/Redo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      } else if (e.key === 's') {
        e.preventDefault();
        this.saveTemplate();
      }

      // Select All (Ctrl+A)
      if (e.key === 'a') {
        e.preventDefault();
        this.selectAllElements();
      }

      // Duplicate
      if (e.key === 'd' && this.selectedElement) {
        e.preventDefault();
        this.duplicateElement(this.selectedElement);
      }

      // Layer manipulation shortcuts
      if (this.selectedElement) {
        // Ctrl+] - Bring Forward
        if (e.key === ']' && !e.shiftKey) {
          e.preventDefault();
          this.bringForward(this.selectedElement);
        }
        // Ctrl+[ - Send Backward
        if (e.key === '[' && !e.shiftKey) {
          e.preventDefault();
          this.sendBackward(this.selectedElement);
        }
        // Ctrl+Shift+] - Bring to Front
        if (e.key === ']' && e.shiftKey) {
          e.preventDefault();
          this.bringToFront(this.selectedElement);
        }
        // Ctrl+Shift+[ - Send to Back
        if (e.key === '[' && e.shiftKey) {
          e.preventDefault();
          this.sendToBack(this.selectedElement);
        }
      }
    }

    // Tool shortcuts (without modifiers)
    if (!e.ctrlKey && !e.metaKey) {
      if (e.key === 'v') this.selectTool('select');
      if (e.key === 't') this.selectTool('text');
      if (e.key === 'i') this.selectTool('image');
      if (e.key === 's') this.selectTool('shape');

      // Escape to deselect
      if (e.key === 'Escape') {
        this.deselectElement();
        this.hideContextMenu();
        this.render();
      }
    }
  }

  getCanvasPosition(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom
    };
  }

  getElementAtPosition(x, y) {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (!el.visible) continue;

      const width = el.width || 100;
      const height = el.type === 'text' ? (el.height || this.measureTextHeight(el)) : (el.height || 100);
      const padding = el.padding || 0;

      let left, right, top, bottom;

      if (el.type === 'text') {
        // Text elements use alignment-based anchor points
        const textAlign = el.textAlign || 'center';
        const boxWidth = width + (padding * 2);
        const boxHeight = height + (padding * 2);

        switch (textAlign) {
          case 'left':
            left = el.x - padding;
            right = left + boxWidth;
            break;
          case 'right':
            right = el.x + padding;
            left = right - boxWidth;
            break;
          case 'center':
          default:
            left = el.x - boxWidth / 2;
            right = el.x + boxWidth / 2;
            break;
        }
        top = el.y - boxHeight / 2;
        bottom = el.y + boxHeight / 2;
      } else {
        // Images and shapes use center positioning
        left = el.x - width / 2;
        right = el.x + width / 2;
        top = el.y - height / 2;
        bottom = el.y + height / 2;
      }

      if (x >= left && x <= right && y >= top && y <= bottom) {
        return el;
      }
    }
    return null;
  }

  // ==================== ELEMENT MANAGEMENT ====================

  selectElement(element) {
    this.selectedElement = element;

    // Also update selectedElements array for single selection
    if (!this.selectedElements.includes(element)) {
      this.selectedElements = [element];
    }

    this.showPropertyPanel(element.type);
    this.loadElementProperties(element);
    this.updateHandles();
    this.renderLayers();

    // Update dynamic toggle states
    this.updateDynamicToggleStates(element);
    this.updateMultiSelectInfo();
  }

  updateDynamicToggleStates(element) {
    // Reset all toggles
    document.querySelectorAll('.dynamic-toggle').forEach(btn => {
      btn.classList.remove('active');
    });

    if (element.dynamicProperties) {
      for (const [property, config] of Object.entries(element.dynamicProperties)) {
        if (config.isDynamic) {
          const btn = document.querySelector(`.dynamic-toggle[data-property="${property}"]`);
          if (btn) {
            btn.classList.add('active');
          }
        }
      }
    }
  }

  deselectElement() {
    this.selectedElement = null;
    this.selectedElements = [];  // Clear multi-selection too
    this.hidePropertyPanels();
    this.hideHandles();
    this.renderLayers();
    this.updateMultiSelectInfo();

    // Reset dynamic toggles
    document.querySelectorAll('.dynamic-toggle').forEach(btn => {
      btn.classList.remove('active');
    });
  }

  addTextElement(x, y) {
    const defaultText = 'Double click to edit';
    const fontSize = 48;
    const fontFamily = 'Inter';
    const fontWeight = 'bold';

    // Measure the actual text width - exact fit
    this.ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const textWidth = this.ctx.measureText(defaultText).width;
    const autoWidth = Math.max(50, textWidth + 4); // Minimal padding for exact fit

    const element = {
      id: `text_${Date.now()}`,
      type: 'text',
      name: 'Text',
      x: x,
      y: y,
      width: autoWidth,
      text: defaultText,
      fontSize: fontSize,
      fontFamily: fontFamily,
      fontWeight: fontWeight,
      color: '#ffffff',
      textAlign: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      backgroundColor: '#000000',
      backgroundOpacity: 0,
      borderColor: '#000000',
      borderWidth: 0,
      borderRadius: 0,
      padding: 0,
      rotation: 0,
      visible: true,
      locked: false,
      autoWidth: true, // Track if width should auto-fit
      dynamicProperties: {}
    };

    this.elements.push(element);
    this.selectElement(element);
    this.render();
    this.renderLayers();
    this.saveState();
  }

  // Measure and auto-fit text width based on content
  measureTextWidth(element) {
    this.ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize}px ${element.fontFamily}`;
    const lines = (element.text || '').split('\n');
    let maxWidth = 0;
    lines.forEach(line => {
      const width = this.ctx.measureText(line).width;
      if (width > maxWidth) maxWidth = width;
    });
    return maxWidth;
  }

  // Auto-fit text element width to content - exact fit
  autoFitTextWidth(element) {
    if (element.type !== 'text') return;
    const textWidth = this.measureTextWidth(element);
    element.width = Math.max(50, textWidth + 4); // Minimal padding for exact fit
  }

  addShapeElement(x, y) {
    const activeShape = document.querySelector('.shape-btn.active');
    const shapeType = activeShape ? activeShape.dataset.shape : 'rect';

    const element = {
      id: `shape_${Date.now()}`,
      type: 'shape',
      name: 'Shape',
      shapeType: shapeType,
      x: x,
      y: y,
      width: 200,
      height: 200,
      fill: '#e94560',
      stroke: '#000000',
      strokeWidth: 0,
      opacity: 100,
      borderRadius: 0,
      rotation: 0,
      visible: true,
      locked: false,
      dynamicProperties: {}
    };

    this.elements.push(element);
    this.selectElement(element);
    this.render();
    this.renderLayers();
    this.saveState();
  }

  addImageElement(src, name = 'Image') {
    const img = new Image();
    img.onload = () => {
      const maxSize = 400;
      let width = img.width;
      let height = img.height;

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }

      const element = {
        id: `image_${Date.now()}`,
        type: 'image',
        name: name,
        x: this.canvasWidth / 2,
        y: this.canvasHeight / 2,
        width: width,
        height: height,
        src: src,
        image: img,
        opacity: 100,
        borderRadius: 0,
        rotation: 0,
        visible: true,
        locked: false,
        dynamicProperties: {}
      };

      this.elements.push(element);
      this.selectElement(element);
      this.render();
      this.renderLayers();
      this.saveState();
    };
    img.src = src;
  }

  handleImageUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (this.selectedElement && this.selectedElement.type === 'image') {
        const img = new Image();
        img.onload = () => {
          this.selectedElement.src = e.target.result;
          this.selectedElement.image = img;
          this.render();
          this.saveState();
        };
        img.src = e.target.result;
      } else {
        this.addImageElement(e.target.result, file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  handleBackgroundUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.background.type = 'image';
        this.background.value = e.target.result;
        this.background.image = img;

        document.getElementById('bgPreview').classList.remove('hidden');
        document.getElementById('bgPreviewImg').src = e.target.result;

        // Show fit and blur options
        document.getElementById('bgFitOptions').classList.remove('hidden');
        document.getElementById('bgBlurOption').classList.remove('hidden');

        this.render();
        this.saveState();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // ==================== PROPERTY PANELS ====================

  showPropertyPanel(type) {
    this.hidePropertyPanels();

    document.getElementById('positionSection').classList.remove('hidden');

    if (type === 'text') {
      document.getElementById('textProperties').classList.remove('hidden');
    } else if (type === 'image') {
      document.getElementById('imageProperties').classList.remove('hidden');
    } else if (type === 'shape') {
      document.getElementById('shapeProperties').classList.remove('hidden');
    }
  }

  hidePropertyPanels() {
    document.getElementById('noSelection').classList.remove('hidden');
    document.getElementById('textProperties').classList.add('hidden');
    document.getElementById('imageProperties').classList.add('hidden');
    document.getElementById('shapeProperties').classList.add('hidden');
    document.getElementById('positionSection').classList.add('hidden');
  }

  updateSelectedElementProperties() {
    if (this.selectedElement) {
      this.loadElementProperties(this.selectedElement);
      this.updateDynamicToggleStates(this.selectedElement);
    }
  }

  loadElementProperties(element) {
    document.getElementById('noSelection').classList.add('hidden');

    // Position
    document.getElementById('elementX').value = Math.round(element.x);
    document.getElementById('elementY').value = Math.round(element.y);
    document.getElementById('elementW').value = Math.round(element.width || 100);
    document.getElementById('elementH').value = Math.round(element.height || 50);
    document.getElementById('elementRotation').value = element.rotation || 0;
    document.getElementById('rotationValue').textContent = `${element.rotation || 0}°`;

    if (element.type === 'text') {
      document.getElementById('textContent').value = element.text || '';
      document.getElementById('fontFamily').value = element.fontFamily || 'Inter';
      document.getElementById('fontSize').value = element.fontSize || 48;
      document.getElementById('fontWeight').value = element.fontWeight || 'normal';
      document.getElementById('textColor').value = element.color || '#ffffff';
      document.getElementById('lineHeight').value = element.lineHeight || 1.2;
      document.getElementById('letterSpacing').value = element.letterSpacing || 0;
      // Background and border properties
      document.getElementById('textBackgroundColor').value = element.backgroundColor || '#000000';
      document.getElementById('textBackgroundOpacity').value = element.backgroundOpacity || 0;
      document.getElementById('textBgOpacityValue').textContent = (element.backgroundOpacity || 0) + '%';
      document.getElementById('textBorderColor').value = element.borderColor || '#000000';
      document.getElementById('textBorderWidth').value = element.borderWidth || 0;
      document.getElementById('textBorderWidthValue').textContent = element.borderWidth || 0;
      document.getElementById('textBorderRadius').value = element.borderRadius || 0;
      document.getElementById('textBorderRadiusValue').textContent = element.borderRadius || 0;
      document.getElementById('textPadding').value = element.padding || 0;
      document.getElementById('textPaddingValue').textContent = element.padding || 0;
      // Text stroke (outline) properties
      document.getElementById('textStrokeColor').value = element.strokeColor || '#000000';
      document.getElementById('textStrokeWidth').value = element.strokeWidth || 0;
      document.getElementById('textStrokeWidthValue').textContent = element.strokeWidth || 0;

      document.querySelectorAll('[data-align]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === (element.textAlign || 'center'));
      });

      // Text width mode (Auto vs Fixed)
      const isAutoWidth = element.autoWidth !== false;
      document.getElementById('autoWidthBtn')?.classList.toggle('active', isAutoWidth);
      document.getElementById('fixedWidthBtn')?.classList.toggle('active', !isAutoWidth);
      document.getElementById('fixedWidthInput').style.display = isAutoWidth ? 'none' : 'block';
      document.getElementById('textWidth').value = Math.round(element.width);
    } else if (element.type === 'image') {
      document.getElementById('imageWidth').value = Math.round(element.width);
      document.getElementById('imageHeight').value = Math.round(element.height);
      document.getElementById('imageOpacity').value = element.opacity || 100;
      document.getElementById('opacityValue').textContent = (element.opacity || 100) + '%';
      document.getElementById('imageBorderRadius').value = element.borderRadius || 0;
      document.getElementById('borderRadiusValue').textContent = (element.borderRadius || 0) + '%';

      // Update fit mode buttons
      const fitMode = element.objectFit || 'cover';
      document.querySelectorAll('.fit-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.fit === fitMode);
      });
      // Image stroke properties
      document.getElementById('imageStrokeColor').value = element.strokeColor || '#000000';
      document.getElementById('imageStrokeWidth').value = element.strokeWidth || 0;
      document.getElementById('imageStrokeWidthValue').textContent = element.strokeWidth || 0;
    } else if (element.type === 'shape') {
      document.querySelectorAll('.shape-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shape === element.shapeType);
      });
      document.getElementById('shapeFill').value = element.fill || '#e94560';
      document.getElementById('shapeStroke').value = element.stroke || '#000000';
      document.getElementById('shapeStrokeWidth').value = element.strokeWidth || 0;
      document.getElementById('strokeWidthValue').textContent = element.strokeWidth || 0;
      document.getElementById('shapeOpacity').value = element.opacity || 100;
      document.getElementById('shapeOpacityValue').textContent = (element.opacity || 100) + '%';
      document.getElementById('shapeBorderRadius').value = element.borderRadius || 0;
      document.getElementById('shapeBorderRadiusValue').textContent = element.borderRadius || 0;
    }
  }

  updateSelectedElement() {
    if (!this.selectedElement) return;

    if (this.selectedElement.type === 'text') {
      const oldText = this.selectedElement.text;
      const oldFontSize = this.selectedElement.fontSize;
      const oldFontFamily = this.selectedElement.fontFamily;
      const oldFontWeight = this.selectedElement.fontWeight;

      this.selectedElement.text = document.getElementById('textContent').value;
      this.selectedElement.fontFamily = document.getElementById('fontFamily').value;
      this.selectedElement.fontSize = parseInt(document.getElementById('fontSize').value);
      this.selectedElement.fontWeight = document.getElementById('fontWeight').value;
      this.selectedElement.color = document.getElementById('textColor').value;
      this.selectedElement.lineHeight = parseFloat(document.getElementById('lineHeight').value);
      this.selectedElement.letterSpacing = parseInt(document.getElementById('letterSpacing').value);
      // Background and border properties
      this.selectedElement.backgroundColor = document.getElementById('textBackgroundColor').value;
      this.selectedElement.backgroundOpacity = parseInt(document.getElementById('textBackgroundOpacity').value);
      this.selectedElement.borderColor = document.getElementById('textBorderColor').value;
      this.selectedElement.borderWidth = parseInt(document.getElementById('textBorderWidth').value);
      this.selectedElement.borderRadius = parseInt(document.getElementById('textBorderRadius').value);
      this.selectedElement.padding = parseInt(document.getElementById('textPadding').value);
      // Text stroke (outline) properties
      this.selectedElement.strokeColor = document.getElementById('textStrokeColor').value;
      this.selectedElement.strokeWidth = parseInt(document.getElementById('textStrokeWidth').value);

      const activeAlign = document.querySelector('[data-align].active');
      this.selectedElement.textAlign = activeAlign ? activeAlign.dataset.align : 'center';

      // Auto-fit width if text, font size, or font changed (Figma-like behavior)
      const textChanged = oldText !== this.selectedElement.text;
      const fontChanged = oldFontSize !== this.selectedElement.fontSize ||
                          oldFontFamily !== this.selectedElement.fontFamily ||
                          oldFontWeight !== this.selectedElement.fontWeight;

      if ((textChanged || fontChanged) && this.selectedElement.autoWidth !== false) {
        this.autoFitTextWidth(this.selectedElement);
      }
    } else if (this.selectedElement.type === 'image') {
      this.selectedElement.width = parseInt(document.getElementById('imageWidth').value);
      this.selectedElement.height = parseInt(document.getElementById('imageHeight').value);
      this.selectedElement.opacity = parseInt(document.getElementById('imageOpacity').value);
      this.selectedElement.borderRadius = parseInt(document.getElementById('imageBorderRadius').value);
      // Image stroke properties
      this.selectedElement.strokeColor = document.getElementById('imageStrokeColor').value;
      this.selectedElement.strokeWidth = parseInt(document.getElementById('imageStrokeWidth').value);
    } else if (this.selectedElement.type === 'shape') {
      const activeShape = document.querySelector('.shape-btn.active');
      this.selectedElement.shapeType = activeShape ? activeShape.dataset.shape : 'rect';
      this.selectedElement.fill = document.getElementById('shapeFill').value;
      this.selectedElement.stroke = document.getElementById('shapeStroke').value;
      this.selectedElement.strokeWidth = parseInt(document.getElementById('shapeStrokeWidth').value);
      this.selectedElement.opacity = parseInt(document.getElementById('shapeOpacity').value);
      this.selectedElement.borderRadius = parseInt(document.getElementById('shapeBorderRadius').value);
    }

    this.render();
    this.updateHandles();
  }

  updateElementPosition() {
    if (!this.selectedElement) return;

    this.selectedElement.x = parseInt(document.getElementById('elementX').value);
    this.selectedElement.y = parseInt(document.getElementById('elementY').value);
    this.selectedElement.width = parseInt(document.getElementById('elementW').value);
    this.selectedElement.height = parseInt(document.getElementById('elementH').value);
    this.selectedElement.rotation = parseInt(document.getElementById('elementRotation').value);

    this.render();
    this.updateHandles();
  }

  updatePositionInputs() {
    if (!this.selectedElement) return;

    document.getElementById('elementX').value = Math.round(this.selectedElement.x);
    document.getElementById('elementY').value = Math.round(this.selectedElement.y);
  }

  // ==================== HANDLES ====================

  updateHandles() {
    if (!this.selectedElement) {
      this.hideHandles();
      return;
    }

    const handles = document.getElementById('elementHandles');
    const el = this.selectedElement;

    // Add element type class for different handle styles
    handles.classList.remove('text-element', 'image-element', 'shape-element');
    handles.classList.add(`${el.type}-element`);

    const width = el.width || 100;
    const height = el.type === 'text' ? this.measureTextHeight(el) : (el.height || 100);
    const padding = el.padding || 0;
    const boxWidth = el.type === 'text' ? width + (padding * 2) : width;
    const boxHeight = el.type === 'text' ? height + (padding * 2) : height;

    // Calculate handle position based on element type and alignment
    let handleLeft, handleTop;

    if (el.type === 'text') {
      const textAlign = el.textAlign || 'center';
      // Position based on alignment anchor point (Figma-like)
      switch (textAlign) {
        case 'left':
          handleLeft = el.x - padding;
          break;
        case 'right':
          handleLeft = el.x - width - padding;
          break;
        case 'center':
        default:
          handleLeft = el.x - boxWidth / 2;
          break;
      }
      handleTop = el.y - boxHeight / 2;
    } else {
      // Images and shapes use center positioning
      handleLeft = el.x - width / 2;
      handleTop = el.y - height / 2;
    }

    // Don't multiply by zoom - the wrapper is already scaled
    handles.style.display = 'block';
    handles.style.left = `${handleLeft}px`;
    handles.style.top = `${handleTop}px`;
    handles.style.width = `${boxWidth}px`;
    handles.style.height = `${boxHeight}px`;
    handles.style.transform = `rotate(${el.rotation || 0}deg)`;
  }

  hideHandles() {
    document.getElementById('elementHandles').style.display = 'none';
  }

  measureTextHeight(element) {
    this.ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize}px ${element.fontFamily}`;
    const lines = this.wrapText(element.text, element.width);
    return lines.length * element.fontSize * (element.lineHeight || 1.2);
  }

  // ==================== RENDERING ====================

  render() {
    this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    this.drawBackground();

    this.elements.forEach(element => {
      if (!element.visible) return;

      this.ctx.save();

      if (element.rotation) {
        this.ctx.translate(element.x, element.y);
        this.ctx.rotate((element.rotation * Math.PI) / 180);
        this.ctx.translate(-element.x, -element.y);
      }

      if (element.type === 'text') {
        this.drawTextElement(element);
      } else if (element.type === 'image') {
        this.drawImageElement(element);
      } else if (element.type === 'shape') {
        this.drawShapeElement(element);
      }

      this.ctx.restore();
    });

    // Draw selection highlights for all selected elements (multi-select)
    this.drawMultiSelectionHighlights();
  }

  drawMultiSelectionHighlights() {
    if (this.selectedElements.length <= 1) return;

    this.ctx.save();

    this.selectedElements.forEach(element => {
      if (!element.visible) return;

      const elWidth = element.width || 100;
      const elHeight = element.type === 'text' ? this.measureTextHeight(element) : (element.height || 100);

      // Calculate element bounds (x, y is center)
      const left = element.x - elWidth / 2;
      const top = element.y - elHeight / 2;

      // Apply rotation if any
      if (element.rotation) {
        this.ctx.save();
        this.ctx.translate(element.x, element.y);
        this.ctx.rotate((element.rotation * Math.PI) / 180);
        this.ctx.translate(-element.x, -element.y);
      }

      // Draw selection highlight
      this.ctx.strokeStyle = '#3B82F6';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([5, 3]);
      this.ctx.strokeRect(left - 2, top - 2, elWidth + 4, elHeight + 4);

      // Small indicator in corner
      this.ctx.fillStyle = '#3B82F6';
      this.ctx.fillRect(left - 4, top - 4, 8, 8);

      if (element.rotation) {
        this.ctx.restore();
      }
    });

    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  drawBackground() {
    if (this.background.type === 'color') {
      this.ctx.fillStyle = this.background.value;
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    } else if (this.background.type === 'gradient') {
      const { start, end, direction } = this.background.value;
      let gradient;

      if (direction === 'radial') {
        gradient = this.ctx.createRadialGradient(
          this.canvasWidth / 2, this.canvasHeight / 2, 0,
          this.canvasWidth / 2, this.canvasHeight / 2, this.canvasWidth / 2
        );
      } else {
        const coords = this.getGradientCoords(direction);
        gradient = this.ctx.createLinearGradient(...coords);
      }

      gradient.addColorStop(0, start);
      gradient.addColorStop(1, end);
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    } else if (this.background.type === 'image') {
      if (this.background.image) {
        const img = this.background.image;
        const fitMode = this.background.fitMode || 'cover';
        const blur = this.background.blur || 0;

        // Calculate dimensions based on fit mode
        const imgAspect = img.width / img.height;
        const canvasAspect = this.canvasWidth / this.canvasHeight;

        let drawWidth, drawHeight, drawX, drawY;

        switch (fitMode) {
          case 'fill':
          case 'stretch':
            // Stretch to fill (may distort)
            drawWidth = this.canvasWidth;
            drawHeight = this.canvasHeight;
            drawX = 0;
            drawY = 0;
            break;

          case 'contain':
            // Fit inside, maintain aspect ratio (letterbox)
            if (imgAspect > canvasAspect) {
              drawWidth = this.canvasWidth;
              drawHeight = this.canvasWidth / imgAspect;
            } else {
              drawHeight = this.canvasHeight;
              drawWidth = this.canvasHeight * imgAspect;
            }
            drawX = (this.canvasWidth - drawWidth) / 2;
            drawY = (this.canvasHeight - drawHeight) / 2;
            // Fill remaining area with color
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            break;

          case 'center':
            // Original size, centered
            drawWidth = img.width;
            drawHeight = img.height;
            drawX = (this.canvasWidth - drawWidth) / 2;
            drawY = (this.canvasHeight - drawHeight) / 2;
            // Fill canvas first
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            break;

          case 'cover':
          default:
            // Cover entire canvas, crop excess
            if (imgAspect > canvasAspect) {
              drawHeight = this.canvasHeight;
              drawWidth = this.canvasHeight * imgAspect;
            } else {
              drawWidth = this.canvasWidth;
              drawHeight = this.canvasWidth / imgAspect;
            }
            drawX = (this.canvasWidth - drawWidth) / 2;
            drawY = (this.canvasHeight - drawHeight) / 2;
            break;
        }

        // Apply blur if set
        if (blur > 0) {
          this.ctx.filter = `blur(${blur}px)`;
        }

        this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        // Reset filter
        if (blur > 0) {
          this.ctx.filter = 'none';
        }
      } else {
        // Fallback while image is loading
        this.ctx.fillStyle = '#f5f5f5';
        this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      }
    } else {
      // Default fallback
      this.ctx.fillStyle = '#f5f5f5';
      this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }

  getGradientCoords(direction) {
    const w = this.canvasWidth;
    const h = this.canvasHeight;

    switch (direction) {
      case 'to bottom': return [0, 0, 0, h];
      case 'to right': return [0, 0, w, 0];
      case 'to bottom right': return [0, 0, w, h];
      case 'to bottom left': return [w, 0, 0, h];
      default: return [0, 0, 0, h];
    }
  }

  drawTextElement(element) {
    this.ctx.font = `${element.fontWeight || 'normal'} ${element.fontSize}px ${element.fontFamily}`;
    this.ctx.textBaseline = 'middle';

    const lines = this.wrapText(element.text, element.width);
    const lineHeight = element.fontSize * (element.lineHeight || 1.2);
    const totalHeight = lines.length * lineHeight;
    const padding = element.padding || 0;
    const borderRadius = element.borderRadius || 0;
    const borderWidth = element.borderWidth || 0;
    const backgroundOpacity = (element.backgroundOpacity || 0) / 100;
    const textAlign = element.textAlign || 'center';

    // Calculate box dimensions
    const boxWidth = element.width + (padding * 2);
    const boxHeight = totalHeight + (padding * 2);

    // Calculate box position based on alignment (Figma-like anchor points)
    // element.x is the anchor point: left edge for left, center for center, right edge for right
    let boxX, textX;
    switch (textAlign) {
      case 'left':
        boxX = element.x - padding;
        textX = element.x;
        this.ctx.textAlign = 'left';
        break;
      case 'right':
        boxX = element.x - element.width - padding;
        textX = element.x;
        this.ctx.textAlign = 'right';
        break;
      case 'center':
      default:
        boxX = element.x - boxWidth / 2;
        textX = element.x;
        this.ctx.textAlign = 'center';
        break;
    }
    const boxY = element.y - boxHeight / 2;

    // Draw background if opacity > 0
    if (backgroundOpacity > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = backgroundOpacity;
      this.ctx.fillStyle = element.backgroundColor || '#000000';

      if (borderRadius > 0) {
        this.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
        this.ctx.fill();
      } else {
        this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
      }
      this.ctx.restore();
    }

    // Draw border if width > 0
    if (borderWidth > 0) {
      this.ctx.save();
      this.ctx.strokeStyle = element.borderColor || '#000000';
      this.ctx.lineWidth = borderWidth;

      if (borderRadius > 0) {
        this.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
        this.ctx.stroke();
      } else {
        this.ctx.strokeRect(boxX, boxY, boxWidth, boxHeight);
      }
      this.ctx.restore();
    }

    // Draw text with optional stroke
    const strokeWidth = element.strokeWidth || 0;
    let startY = element.y - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, i) => {
      const lineY = startY + i * lineHeight;

      // Draw stroke first (behind fill)
      if (strokeWidth > 0) {
        this.ctx.strokeStyle = element.strokeColor || '#000000';
        this.ctx.lineWidth = strokeWidth;
        this.ctx.lineJoin = 'round';
        this.ctx.miterLimit = 2;
        this.ctx.strokeText(line, textX, lineY);
      }

      // Draw fill on top
      this.ctx.fillStyle = element.color;
      this.ctx.fillText(line, textX, lineY);
    });

    element.height = totalHeight;
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

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length ? lines : [text];
  }

  drawImageElement(element) {
    if (!element.image) return;

    this.ctx.globalAlpha = (element.opacity || 100) / 100;

    const img = element.image;
    const fitMode = element.objectFit || 'contain';

    // Calculate dimensions based on fit mode
    const imgAspect = img.width / img.height;
    const boxAspect = element.width / element.height;

    let drawWidth, drawHeight, drawX, drawY;
    let srcX = 0, srcY = 0, srcWidth = img.width, srcHeight = img.height;

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
        // Cover entire box, crop excess (no distortion)
        if (imgAspect > boxAspect) {
          // Image is wider - fit to height, crop width
          drawHeight = element.height;
          drawWidth = element.height * imgAspect;
        } else {
          // Image is taller - fit to width, crop height
          drawWidth = element.width;
          drawHeight = element.width / imgAspect;
        }
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;

      case 'center':
      case 'none':
        // Original size, centered (may overflow or be smaller)
        drawWidth = img.width;
        drawHeight = img.height;
        // Scale down if image is larger than container
        if (drawWidth > element.width || drawHeight > element.height) {
          const scale = Math.min(element.width / drawWidth, element.height / drawHeight);
          drawWidth *= scale;
          drawHeight *= scale;
        }
        drawX = element.x - drawWidth / 2;
        drawY = element.y - drawHeight / 2;
        break;

      case 'contain':
      default:
        // Fit inside box, maintain aspect ratio (may have letterboxing)
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

    // Apply custom crop if specified
    if (element.cropArea) {
      srcX = element.cropArea.x * img.width;
      srcY = element.cropArea.y * img.height;
      srcWidth = element.cropArea.width * img.width;
      srcHeight = element.cropArea.height * img.height;
    }

    // Draw with clipping for border radius
    const clipX = element.x - element.width / 2;
    const clipY = element.y - element.height / 2;

    this.ctx.save();

    if (element.borderRadius) {
      this.roundRect(clipX, clipY, element.width, element.height, element.borderRadius);
      this.ctx.clip();
    } else {
      // Still clip to element bounds for cover mode
      this.ctx.beginPath();
      this.ctx.rect(clipX, clipY, element.width, element.height);
      this.ctx.clip();
    }

    if (element.cropArea) {
      this.ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, drawX, drawY, drawWidth, drawHeight);
    } else {
      this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    }

    this.ctx.restore();

    // Draw stroke/border outline around the image
    const strokeWidth = element.strokeWidth || 0;
    if (strokeWidth > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = 1; // Reset alpha for stroke visibility
      this.ctx.strokeStyle = element.strokeColor || '#000000';
      this.ctx.lineWidth = strokeWidth;
      // Draw stroke following border radius
      if (element.borderRadius) {
        this.roundRect(clipX, clipY, element.width, element.height, element.borderRadius);
        this.ctx.stroke();
      } else {
        this.ctx.strokeRect(clipX, clipY, element.width, element.height);
      }
      this.ctx.restore();
    }

    this.ctx.globalAlpha = 1;
  }

  drawShapeElement(element) {
    this.ctx.globalAlpha = (element.opacity || 100) / 100;
    this.ctx.fillStyle = element.fill;
    this.ctx.strokeStyle = element.stroke;
    this.ctx.lineWidth = element.strokeWidth;

    const x = element.x - element.width / 2;
    const y = element.y - element.height / 2;
    const borderRadius = element.borderRadius || 0;

    switch (element.shapeType) {
      case 'rect':
        if (borderRadius > 0) {
          // Draw rounded rectangle
          this.roundRect(x, y, element.width, element.height, borderRadius);
          this.ctx.fill();
          if (element.strokeWidth) {
            this.ctx.stroke();
          }
        } else {
          this.ctx.fillRect(x, y, element.width, element.height);
          if (element.strokeWidth) {
            this.ctx.strokeRect(x, y, element.width, element.height);
          }
        }
        break;

      case 'circle':
        this.ctx.beginPath();
        this.ctx.ellipse(element.x, element.y, element.width / 2, element.height / 2, 0, 0, Math.PI * 2);
        this.ctx.fill();
        if (element.strokeWidth) {
          this.ctx.stroke();
        }
        break;

      case 'triangle':
        this.ctx.beginPath();
        this.ctx.moveTo(element.x, y);
        this.ctx.lineTo(x + element.width, y + element.height);
        this.ctx.lineTo(x, y + element.height);
        this.ctx.closePath();
        this.ctx.fill();
        if (element.strokeWidth) {
          this.ctx.stroke();
        }
        break;

      case 'line':
        this.ctx.beginPath();
        this.ctx.moveTo(x, element.y);
        this.ctx.lineTo(x + element.width, element.y);
        this.ctx.strokeStyle = element.fill;
        this.ctx.lineWidth = element.height || 4;
        this.ctx.stroke();
        break;
    }

    this.ctx.globalAlpha = 1;
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

  // ==================== LAYERS ====================

  renderLayers() {
    const list = document.getElementById('layersList');
    const isTopmost = (i) => i === this.elements.length - 1;
    const isBottommost = (i) => i === 0;

    list.innerHTML = this.elements.map((el, i) => {
      const hasDynamic = el.dynamicProperties && Object.keys(el.dynamicProperties).length > 0;
      const dynamicCount = hasDynamic ? Object.keys(el.dynamicProperties).length : 0;

      return `
        <li class="layer-item ${this.selectedElement === el ? 'selected' : ''} ${hasDynamic ? 'has-dynamic' : ''}"
            data-index="${i}" draggable="true">
          <div class="layer-drag-handle" title="Drag to reorder">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <div class="layer-icon">
            <i class="fas fa-${el.type === 'text' ? 'font' : el.type === 'image' ? 'image' : 'shapes'}"></i>
          </div>
          <span class="layer-name">${el.name || 'Unnamed'}</span>
          ${hasDynamic ? `<div class="layer-badges"><span class="layer-badge">${dynamicCount}</span></div>` : ''}
          <div class="layer-actions">
            <button class="layer-action layer-move" data-action="moveUp" title="Move Up (Forward)" ${isTopmost(i) ? 'disabled' : ''}>
              <i class="fas fa-chevron-up"></i>
            </button>
            <button class="layer-action layer-move" data-action="moveDown" title="Move Down (Backward)" ${isBottommost(i) ? 'disabled' : ''}>
              <i class="fas fa-chevron-down"></i>
            </button>
            <button class="layer-action" data-action="toggle" title="${el.visible ? 'Hide' : 'Show'}">
              <i class="fas fa-${el.visible ? 'eye' : 'eye-slash'}"></i>
            </button>
            <button class="layer-action" data-action="delete" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </li>
      `;
    }).reverse().join('');

    // Setup layer item event listeners
    list.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.layer-action') || e.target.closest('.layer-drag-handle')) return;
        const index = parseInt(item.dataset.index);
        this.selectElement(this.elements[index]);
        this.render();
      });

      // Move up (bring forward)
      item.querySelector('[data-action="moveUp"]')?.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.moveLayerUp(index);
      });

      // Move down (send backward)
      item.querySelector('[data-action="moveDown"]')?.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.moveLayerDown(index);
      });

      item.querySelector('[data-action="toggle"]')?.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        this.elements[index].visible = !this.elements[index].visible;
        this.render();
        this.renderLayers();
      });

      item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        const index = parseInt(item.dataset.index);
        const element = this.elements[index];

        // Remove placeholders
        for (const [name, placeholder] of Object.entries(this.placeholders)) {
          if (placeholder.elementId === element.id) {
            delete this.placeholders[name];
          }
        }

        this.elements.splice(index, 1);
        this.deselectElement();
        this.render();
        this.renderLayers();
        this.renderPlaceholders();
        this.saveState();
      });

      // Drag and drop for reordering
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.index);
        item.classList.add('dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        item.classList.add('drag-over');
      });

      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over');
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = parseInt(item.dataset.index);
        if (fromIndex !== toIndex) {
          this.reorderLayers(fromIndex, toIndex);
        }
      });
    });
  }

  // Layer manipulation methods
  moveLayerUp(index) {
    if (index < this.elements.length - 1) {
      const temp = this.elements[index];
      this.elements[index] = this.elements[index + 1];
      this.elements[index + 1] = temp;
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  moveLayerDown(index) {
    if (index > 0) {
      const temp = this.elements[index];
      this.elements[index] = this.elements[index - 1];
      this.elements[index - 1] = temp;
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  bringToFront(element) {
    const index = this.elements.indexOf(element);
    if (index > -1 && index < this.elements.length - 1) {
      this.elements.splice(index, 1);
      this.elements.push(element);
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  sendToBack(element) {
    const index = this.elements.indexOf(element);
    if (index > 0) {
      this.elements.splice(index, 1);
      this.elements.unshift(element);
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  bringForward(element) {
    const index = this.elements.indexOf(element);
    if (index > -1 && index < this.elements.length - 1) {
      this.elements.splice(index, 1);
      this.elements.splice(index + 1, 0, element);
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  sendBackward(element) {
    const index = this.elements.indexOf(element);
    if (index > 0) {
      this.elements.splice(index, 1);
      this.elements.splice(index - 1, 0, element);
      this.updateZIndices();
      this.render();
      this.renderLayers();
      this.saveState();
    }
  }

  reorderLayers(fromIndex, toIndex) {
    const element = this.elements.splice(fromIndex, 1)[0];
    this.elements.splice(toIndex, 0, element);
    this.updateZIndices();
    this.render();
    this.renderLayers();
    this.saveState();
  }

  updateZIndices() {
    this.elements.forEach((el, index) => {
      el.zIndex = index + 1;
    });
  }

  // ==================== CONTEXT MENU ====================

  setupContextMenu() {
    // Create context menu if it doesn't exist
    if (!document.getElementById('layerContextMenu')) {
      const menu = document.createElement('div');
      menu.id = 'layerContextMenu';
      menu.className = 'context-menu';
      menu.innerHTML = `
        <div class="context-menu-item" data-action="bringToFront">
          <i class="fas fa-layer-group"></i>
          <span>Bring to Front</span>
          <span class="shortcut">Ctrl+Shift+]</span>
        </div>
        <div class="context-menu-item" data-action="bringForward">
          <i class="fas fa-chevron-up"></i>
          <span>Bring Forward</span>
          <span class="shortcut">Ctrl+]</span>
        </div>
        <div class="context-menu-item" data-action="sendBackward">
          <i class="fas fa-chevron-down"></i>
          <span>Send Backward</span>
          <span class="shortcut">Ctrl+[</span>
        </div>
        <div class="context-menu-item" data-action="sendToBack">
          <i class="fas fa-layer-group fa-flip-vertical"></i>
          <span>Send to Back</span>
          <span class="shortcut">Ctrl+Shift+[</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="duplicate">
          <i class="fas fa-copy"></i>
          <span>Duplicate</span>
          <span class="shortcut">Ctrl+D</span>
        </div>
        <div class="context-menu-item" data-action="delete">
          <i class="fas fa-trash"></i>
          <span>Delete</span>
          <span class="shortcut">Del</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" data-action="lock">
          <i class="fas fa-lock"></i>
          <span>Lock/Unlock</span>
        </div>
        <div class="context-menu-item" data-action="visibility">
          <i class="fas fa-eye"></i>
          <span>Show/Hide</span>
        </div>
      `;
      document.body.appendChild(menu);

      // Add event listeners to menu items
      menu.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = item.dataset.action;
          this.handleContextMenuAction(action);
          this.hideContextMenu();
        });
      });
    }
  }

  handleContextMenu(e) {
    e.preventDefault();

    // Get the element under the cursor
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scale;
    const y = (e.clientY - rect.top) / this.scale;

    // Find element at this position (check from top to bottom)
    let clickedElement = null;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (!el.visible) continue;

      const elX = el.x - (el.width / 2);
      const elY = el.y - ((el.height || el.fontSize * 1.5) / 2);
      const elWidth = el.width;
      const elHeight = el.height || el.fontSize * 1.5;

      if (x >= elX && x <= elX + elWidth && y >= elY && y <= elY + elHeight) {
        clickedElement = el;
        break;
      }
    }

    if (clickedElement) {
      this.selectElement(clickedElement);
      this.render();
      this.showContextMenu(e.clientX, e.clientY);
    } else {
      this.hideContextMenu();
    }
  }

  showContextMenu(x, y) {
    const menu = document.getElementById('layerContextMenu');
    if (!menu) return;

    // Update menu item states based on selected element
    const lockItem = menu.querySelector('[data-action="lock"]');
    const visibilityItem = menu.querySelector('[data-action="visibility"]');

    if (this.selectedElement) {
      if (lockItem) {
        lockItem.querySelector('i').className = this.selectedElement.locked ? 'fas fa-unlock' : 'fas fa-lock';
        lockItem.querySelector('span:not(.shortcut)').textContent = this.selectedElement.locked ? 'Unlock' : 'Lock';
      }
      if (visibilityItem) {
        visibilityItem.querySelector('i').className = this.selectedElement.visible ? 'fas fa-eye-slash' : 'fas fa-eye';
        visibilityItem.querySelector('span:not(.shortcut)').textContent = this.selectedElement.visible ? 'Hide' : 'Show';
      }
    }

    // Position the menu
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('show');

    // Adjust position if menu goes off screen
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = `${x - menuRect.width}px`;
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = `${y - menuRect.height}px`;
    }
  }

  hideContextMenu() {
    const menu = document.getElementById('layerContextMenu');
    if (menu) {
      menu.classList.remove('show');
    }
  }

  handleContextMenuAction(action) {
    if (!this.selectedElement) return;

    switch (action) {
      case 'bringToFront':
        this.bringToFront(this.selectedElement);
        break;
      case 'bringForward':
        this.bringForward(this.selectedElement);
        break;
      case 'sendBackward':
        this.sendBackward(this.selectedElement);
        break;
      case 'sendToBack':
        this.sendToBack(this.selectedElement);
        break;
      case 'duplicate':
        this.duplicateElement(this.selectedElement);
        break;
      case 'delete':
        this.deleteSelectedElement();
        break;
      case 'lock':
        this.selectedElement.locked = !this.selectedElement.locked;
        this.render();
        this.renderLayers();
        this.saveState();
        break;
      case 'visibility':
        this.selectedElement.visible = !this.selectedElement.visible;
        this.render();
        this.renderLayers();
        this.saveState();
        break;
    }
  }

  duplicateElement(element) {
    const newElement = JSON.parse(JSON.stringify(element));
    newElement.id = `${element.type}_${Date.now()}`;
    newElement.name = `${element.name} Copy`;
    newElement.x += 20;
    newElement.y += 20;
    this.elements.push(newElement);
    this.selectElement(newElement);
    this.updateZIndices();
    this.render();
    this.renderLayers();
    this.saveState();
  }

  deleteSelectedElement() {
    // Handle multi-select deletion
    if (this.selectedElements.length > 1) {
      this.deleteSelectedElements();
      return;
    }

    if (!this.selectedElement) return;

    const index = this.elements.indexOf(this.selectedElement);
    if (index > -1) {
      // Remove placeholders
      for (const [name, placeholder] of Object.entries(this.placeholders)) {
        if (placeholder.elementId === this.selectedElement.id) {
          delete this.placeholders[name];
        }
      }

      this.elements.splice(index, 1);
      this.deselectElement();
      this.render();
      this.renderLayers();
      this.renderPlaceholders();
      this.saveState();
    }
  }

  deleteSelectedElements() {
    if (this.selectedElements.length === 0) return;

    // Delete all selected elements
    this.selectedElements.forEach(element => {
      const index = this.elements.indexOf(element);
      if (index > -1) {
        // Remove associated placeholders
        for (const [name, placeholder] of Object.entries(this.placeholders)) {
          if (placeholder.elementId === element.id) {
            delete this.placeholders[name];
          }
        }
        this.elements.splice(index, 1);
      }
    });

    this.deselectElement();
    this.render();
    this.renderLayers();
    this.renderPlaceholders();
    this.saveState();
    this.showToast(`${this.selectedElements.length} elements deleted`, 'success');
  }

  selectAllElements() {
    if (this.elements.length === 0) return;

    this.selectedElements = [...this.elements];
    this.selectedElement = this.selectedElements[this.selectedElements.length - 1];
    this.render();
    this.updateHandles();
    this.renderLayers();
    this.updateMultiSelectInfo();
    this.showToast(`${this.elements.length} elements selected`, 'info');
  }

  // ==================== PANELS ====================

  switchPanel(panel) {
    document.querySelectorAll('.panel-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.panel === panel);
    });

    document.querySelectorAll('.panel-content').forEach(content => {
      content.classList.toggle('active', content.id === `panel-${panel}`);
    });

    if (panel === 'layers') {
      this.renderLayers();
    } else if (panel === 'placeholders') {
      this.renderPlaceholders();
    }
  }

  // ==================== PLATFORM ====================

  changePlatform(btn) {
    document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    this.canvasWidth = parseInt(btn.dataset.width);
    this.canvasHeight = parseInt(btn.dataset.height);
    this.setupCanvas();
    this.render();
  }

  // ==================== HISTORY ====================

  saveState() {
    const state = {
      elements: JSON.parse(JSON.stringify(this.elements.map(el => {
        const copy = { ...el };
        delete copy.image;
        return copy;
      }))),
      background: JSON.parse(JSON.stringify({
        type: this.background.type,
        value: this.background.type === 'image' ? null : this.background.value,
        isDynamic: this.background.isDynamic,
        placeholder: this.background.placeholder
      })),
      placeholders: JSON.parse(JSON.stringify(this.placeholders))
    };

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);
    this.historyIndex++;

    // Mark as having unsaved changes and trigger auto-save
    this.markUnsaved();
    this.scheduleAutoSave();
  }

  // ==================== AUTO-SAVE ====================

  markUnsaved() {
    this.hasUnsavedChanges = true;
    this.updateSaveStatus('unsaved');
  }

  markSaved() {
    this.hasUnsavedChanges = false;
    this.lastSavedAt = new Date();
    this.updateSaveStatus('saved');
  }

  updateSaveStatus(status) {
    const saveStatus = document.getElementById('saveStatus');
    if (!saveStatus) return;

    const icon = saveStatus.querySelector('i');
    const text = saveStatus.querySelector('span');

    saveStatus.classList.remove('saved', 'unsaved', 'saving');

    switch (status) {
      case 'saved':
        saveStatus.classList.add('saved');
        if (icon) icon.className = 'fas fa-check-circle';
        if (text) text.textContent = 'Saved';
        break;
      case 'unsaved':
        saveStatus.classList.add('unsaved');
        if (icon) icon.className = 'fas fa-circle';
        if (text) text.textContent = 'Unsaved changes';
        break;
      case 'saving':
        saveStatus.classList.add('saving');
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        if (text) text.textContent = 'Saving...';
        break;
    }
  }

  scheduleAutoSave() {
    if (!this.autoSaveEnabled) return;

    // Clear existing timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Schedule new auto-save
    this.autoSaveTimer = setTimeout(() => {
      this.autoSave();
    }, this.autoSaveDelay);
  }

  async autoSave() {
    // Don't auto-save if already saving or no unsaved changes
    if (this.isSaving || !this.hasUnsavedChanges) return;

    // Don't auto-save new templates without a name
    const name = document.getElementById('templateName')?.value;
    if (!this.templateId && (!name || name === 'Untitled Template')) {
      return;
    }

    await this.saveTemplate(true); // true = silent save (no toast)
  }

  toggleAutoSave(enabled) {
    this.autoSaveEnabled = enabled;
    if (!enabled && this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.showToast(`Auto-save ${enabled ? 'enabled' : 'disabled'}`, 'info');
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState(this.history[this.historyIndex]);
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState(this.history[this.historyIndex]);
    }
  }

  restoreState(state) {
    this.elements = state.elements.map(el => {
      if (el.type === 'image' && el.src) {
        const img = new Image();
        img.src = el.src;
        el.image = img;
      }
      return el;
    });

    if (state.background.type !== 'image') {
      this.background = state.background;
    }

    this.placeholders = state.placeholders || {};

    this.deselectElement();
    this.render();
    this.renderLayers();
    this.renderPlaceholders();
  }

  // ==================== SAVE/LOAD TEMPLATE ====================

  async loadTemplate() {
    try {
      const response = await fetch(`/api/templates/item/${this.templateId}`);
      const data = await response.json();

      if (data.success && data.template) {
        const template = data.template;

        document.getElementById('templateName').value = template.name;

        this.canvasWidth = template.width || 1080;
        this.canvasHeight = template.height || 1080;
        this.setupCanvas();

        // Load elements
        if (template.elements) {
          console.log('=== LOADING TEMPLATE ELEMENTS ===');
          console.log('Canvas size:', this.canvasWidth, 'x', this.canvasHeight);
          console.log('Number of elements:', template.elements.length);

          this.elements = template.elements.map((el, index) => {
            // LOG: Raw element data
            console.log(`Loading element ${index} [${el.type}]:`, {
              x: el.x,
              y: el.y,
              width: el.width,
              text: el.text?.substring(0, 30),
              hasNestedPosition: !!el.position,
              hasNestedSize: !!el.size
            });

            // FIX: Flatten nested structures if present
            if (el.position && typeof el.position === 'object') {
              console.warn('⚠️ Flattening nested position');
              el.x = el.position.x;
              el.y = el.position.y;
              delete el.position;
            }
            if (el.size && typeof el.size === 'object') {
              console.warn('⚠️ Flattening nested size');
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
            if (el.style && typeof el.style === 'object') {
              Object.assign(el, el.style);
              delete el.style;
            }

            // Ensure centered text uses canvas center
            if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
              const expectedX = Math.round(this.canvasWidth / 2);
              if (Math.abs(el.x - expectedX) > 10) {
                console.warn(`⚠️ Centering element: x was ${el.x}, setting to ${expectedX}`);
                el.x = expectedX;
              }
            }

            // FIX: Center shape elements that are likely frames (should follow person photo)
            if (el.type === 'shape' && (el.name?.includes('Frame') || el.id?.includes('frame'))) {
              const expectedX = Math.round(this.canvasWidth / 2);
              if (Math.abs(el.x - expectedX) > 50) {
                console.warn(`⚠️ Centering shape frame: x was ${el.x}, setting to ${expectedX}`);
                el.x = expectedX;
              }
              // Also fix Y position for frames - should be around center
              const frameMinY = 60 + ((el.height || 200) / 2);
              if (el.y < frameMinY) {
                const idealFrameY = Math.round(this.canvasHeight * 0.42);
                console.warn(`⚠️ Frame too high: y=${el.y}, moving to y=${idealFrameY}`);
                el.y = idealFrameY;
              }
            }

            // FIX: Limit width to safe maximum (canvas - 120px margin)
            const maxSafeWidth = this.canvasWidth - 120;
            if (el.width > maxSafeWidth) {
              console.warn(`⚠️ Width too large: ${el.width}, limiting to ${maxSafeWidth}`);
              el.width = maxSafeWidth;
            }

            // FIX: Ensure y position is not too close to edges (accounting for element height)
            const padding = el.padding || 0;
            const elHeight = el.height || (el.fontSize ? el.fontSize * 1.5 : 50);
            const minY = 60 + (elHeight / 2) + padding;  // Account for element height
            const maxY = this.canvasHeight - 60 - (elHeight / 2) - padding;
            if (el.y < minY) {
              console.warn(`⚠️ y too close to top: ${el.y}, height=${elHeight}, setting to ${minY}`);
              el.y = minY;
            } else if (el.y > maxY) {
              console.warn(`⚠️ y too close to bottom: ${el.y}, setting to ${maxY}`);
              el.y = maxY;
            }

            // FIX: Center image elements horizontally and fix Y position
            if (el.type === 'image') {
              const expectedX = Math.round(this.canvasWidth / 2);
              if (Math.abs(el.x - expectedX) > 50) {
                console.warn(`⚠️ Centering image: x was ${el.x}, setting to ${expectedX}`);
                el.x = expectedX;
              }
              // Ensure reasonable image dimensions
              if (!el.width || el.width < 50) el.width = 200;
              if (!el.height || el.height < 50) el.height = 200;

              // FIX: Ensure image Y position accounts for image height
              // Top edge = y - height/2, must be >= 60 (safe margin)
              // So y must be >= 60 + height/2
              const imgMinY = 60 + (el.height / 2);
              const imgMaxY = this.canvasHeight - 60 - (el.height / 2);

              if (el.y < imgMinY) {
                console.warn(`⚠️ Image top edge off canvas: y=${el.y}, height=${el.height}, setting y to ${imgMinY}`);
                el.y = imgMinY;
              } else if (el.y > imgMaxY) {
                console.warn(`⚠️ Image bottom edge off canvas: y=${el.y}, setting y to ${imgMaxY}`);
                el.y = imgMaxY;
              }

              // For person photos, place in center area if y is suspiciously low
              if ((el.placeholderKey === 'person_photo' || el.id?.includes('person') || el.id?.includes('photo') || el.name?.includes('Person')) && !el.id?.includes('logo')) {
                const idealY = Math.round(this.canvasHeight * 0.42); // ~450px for center area
                if (el.y < this.canvasHeight * 0.3) {
                  console.warn(`⚠️ Person photo too high: y=${el.y}, moving to center area y=${idealY}`);
                  el.y = idealY;
                }
              }

              // For business logos, place in logo zone
              if (el.placeholderKey === 'business_logo' || el.id?.includes('logo')) {
                const idealLogoY = Math.round(this.canvasHeight * 0.72); // ~778px
                if (el.y < this.canvasHeight * 0.5) {
                  console.warn(`⚠️ Business logo too high: y=${el.y}, moving to logo zone y=${idealLogoY}`);
                  el.y = idealLogoY;
                }
              }
            }

            // FIX: Ensure business name has prominent font size (minimum 65px for 1080px canvas)
            if (el.placeholderKey === 'business_name' || el.id === 'business_name') {
              const minBusinessFontSize = Math.round(this.canvasWidth * 0.06); // 6% minimum
              if (el.fontSize < minBusinessFontSize) {
                console.warn(`⚠️ Business name font too small: ${el.fontSize}, setting to ${minBusinessFontSize}`);
                el.fontSize = minBusinessFontSize;
                el.fontSizePercent = 6;
              }
            }

            // FIX: Ensure person names are visible (minimum 54px for 1080px canvas)
            if (el.placeholderKey === 'person_name' || el.id?.includes('person_name')) {
              const minPersonFontSize = Math.round(this.canvasWidth * 0.05); // 5% minimum
              if (el.fontSize < minPersonFontSize) {
                console.warn(`⚠️ Person name font too small: ${el.fontSize}, setting to ${minPersonFontSize}`);
                el.fontSize = minPersonFontSize;
                el.fontSizePercent = 5;
              }
            }

            // FIX: Ensure contact details are visible (minimum 27px for 1080px canvas)
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
              const minContactFontSize = Math.round(this.canvasWidth * 0.025); // 2.5% minimum
              if (el.fontSize < minContactFontSize) {
                console.warn(`⚠️ Contact detail font too small: ${el.fontSize}, setting to ${minContactFontSize}`);
                el.fontSize = minContactFontSize;
                el.fontSizePercent = 2.5;
              }
            }

            if (el.type === 'image' && el.src) {
              const img = new Image();
              img.onload = () => this.render();
              img.src = el.src;
              el.image = img;
            }

            console.log(`Element ${index} FINAL:`, { x: el.x, y: el.y, width: el.width });
            return el;
          });

          console.log('=== ALL ELEMENTS LOADED ===');
        }

        // Load background
        if (template.background_type) {
          this.background.type = template.background_type;
          if (template.background_value) {
            let bgUrl = null;
            let parsedValue = null;

            // Try to parse as JSON
            try {
              parsedValue = JSON.parse(template.background_value);
            } catch {
              // Not JSON - use as-is
            }

            if (template.background_type === 'image') {
              // Determine the URL from various formats
              if (parsedValue && parsedValue.url) {
                bgUrl = parsedValue.url;
              } else if (typeof parsedValue === 'string') {
                bgUrl = parsedValue;
              } else if (typeof template.background_value === 'string' && !parsedValue) {
                // Direct URL (legacy format or data URL)
                bgUrl = template.background_value;
              }

              if (bgUrl) {
                this.background.value = bgUrl;
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                  this.background.image = img;
                  // Update preview
                  document.getElementById('bgPreview').classList.remove('hidden');
                  document.getElementById('bgPreviewImg').src = bgUrl;
                  // Show fit and blur options
                  document.getElementById('bgFitOptions').classList.remove('hidden');
                  document.getElementById('bgBlurOption').classList.remove('hidden');
                  // Switch to image background type in UI
                  document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
                  document.querySelector('.bg-type-btn[data-bg-type="image"]')?.classList.add('active');
                  document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
                  document.getElementById('bgImageOptions')?.classList.add('active');
                  this.render();
                };
                img.onerror = () => {
                  console.error('Failed to load background image:', bgUrl);
                  // Fallback to a nice gradient instead of plain color
                  this.background.type = 'gradient';
                  this.background.value = {
                    type: 'linear',
                    angle: 135,
                    stops: [
                      { color: '#667eea', position: 0 },
                      { color: '#764ba2', position: 100 }
                    ]
                  };
                  // Update UI to show gradient options
                  document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
                  document.querySelector('.bg-type-btn[data-bg-type="gradient"]')?.classList.add('active');
                  document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
                  document.getElementById('bgGradientOptions')?.classList.add('active');
                  this.render();
                  // Show user-friendly notification
                  this.showToast('Background image not found. Applied a fallback gradient - you can choose a new background.', 'warning');
                };
                img.src = bgUrl;
              }
            } else {
              // Color or gradient
              this.background.value = parsedValue || template.background_value;
            }
          }
        }

        // Load background fit mode and blur
        if (template.background_fitMode) {
          this.background.fitMode = template.background_fitMode;
          // Update UI
          document.querySelectorAll('.bg-fit-btn').forEach(b => b.classList.remove('active'));
          document.querySelector(`.bg-fit-btn[data-fit="${template.background_fitMode}"]`)?.classList.add('active');
        }
        if (template.background_blur !== undefined) {
          this.background.blur = template.background_blur;
          const blurSlider = document.getElementById('bgBlur');
          if (blurSlider) {
            blurSlider.value = template.background_blur;
            document.getElementById('bgBlurValue').textContent = template.background_blur + 'px';
          }
        }

        // Load placeholders
        if (template.placeholders) {
          this.placeholders = template.placeholders;
        }

        // Set platform
        const platformBtn = document.querySelector(`.platform-btn[data-platform="${template.platform}"]`);
        if (platformBtn) {
          document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('active'));
          platformBtn.classList.add('active');
        }

        this.render();
        this.renderLayers();
        this.renderPlaceholders();
        this.saveState();
      }
    } catch (error) {
      console.error('Failed to load template:', error);
      this.loadDefaultElements();
    }
  }

  async saveTemplate(silent = false) {
    // Prevent concurrent saves
    if (this.isSaving) return;

    const name = document.getElementById('templateName').value || 'Untitled Template';
    const activePlatform = document.querySelector('.platform-btn.active');

    // Generate thumbnail from canvas
    const thumbnail = this.generateThumbnail();

    const templateData = {
      business_id: this.businessId,
      name: name,
      platform: activePlatform?.dataset.platform?.split('-')[0] || 'instagram',
      content_type: 'post',
      width: this.canvasWidth,
      height: this.canvasHeight,
      elements: this.elements.map(el => {
        const copy = { ...el };
        delete copy.image;
        return copy;
      }),
      background_type: this.background.type,
      background_value: this.background.type === 'image'
        ? JSON.stringify({ url: this.background.value })
        : JSON.stringify(this.background.value),
      background_fitMode: this.background.fitMode || 'cover',
      background_blur: this.background.blur || 0,
      placeholders: this.placeholders,
      thumbnail: thumbnail,
      manuallyEdited: true // Flag to skip aggressive position normalization in generate
    };

    try {
      this.isSaving = true;
      this.updateSaveStatus('saving');

      let response;
      if (this.templateId) {
        response = await fetch(`/api/templates/${this.templateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
      } else {
        response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(templateData)
        });
      }

      const data = await response.json();

      if (data.success) {
        if (!this.templateId && data.template?.id) {
          this.templateId = data.template.id;
          window.history.replaceState({}, '', `/?id=${this.templateId}&business=${this.businessId}`);
        }

        this.markSaved();

        if (!silent) {
          this.showToast('Template saved successfully!', 'success');
        }
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.updateSaveStatus('unsaved');
      if (!silent) {
        this.showToast('Failed to save template', 'error');
      }
      console.error('Save failed:', error);
    } finally {
      this.isSaving = false;
    }
  }

  // ==================== GENERATE POSTS ====================

  goToGenerate() {
    if (!this.templateId) {
      this.showToast('Please save the template first', 'warning');
      return;
    }

    if (Object.keys(this.placeholders).length === 0) {
      this.showToast('Add at least one placeholder to generate posts', 'warning');
      return;
    }

    window.location.href = `/generate.html?template=${this.templateId}&business=${this.businessId}`;
  }

  // ==================== THUMBNAIL ====================

  generateThumbnail() {
    try {
      // Create a temporary canvas for the thumbnail
      const maxSize = 300;
      const aspectRatio = this.canvasWidth / this.canvasHeight;

      let thumbWidth, thumbHeight;
      if (aspectRatio >= 1) {
        thumbWidth = maxSize;
        thumbHeight = maxSize / aspectRatio;
      } else {
        thumbHeight = maxSize;
        thumbWidth = maxSize * aspectRatio;
      }

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = thumbWidth;
      thumbCanvas.height = thumbHeight;

      const ctx = thumbCanvas.getContext('2d');
      ctx.drawImage(this.canvas, 0, 0, thumbWidth, thumbHeight);

      // Return as base64 data URL with JPEG compression for smaller size
      return thumbCanvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return null;
    }
  }

  // ==================== EXPORT ====================

  showExportModal() {
    const modal = document.getElementById('exportModal');
    modal.classList.add('show');

    const preview = document.getElementById('exportPreview');
    preview.width = 300;
    preview.height = 300 * (this.canvasHeight / this.canvasWidth);

    const ctx = preview.getContext('2d');
    ctx.drawImage(this.canvas, 0, 0, preview.width, preview.height);
  }

  downloadImage() {
    const format = document.querySelector('.format-option.active')?.dataset.format || 'png';
    const quality = parseInt(document.getElementById('exportQuality').value) / 100;

    const mimeType = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const dataUrl = this.canvas.toDataURL(mimeType, quality);

    const link = document.createElement('a');
    link.download = `template_${Date.now()}.${format}`;
    link.href = dataUrl;
    link.click();

    this.closeModals();
    this.showToast('Image downloaded successfully', 'success');
  }

  // ==================== AI BACKGROUND ====================

  async searchBackgrounds() {
    const prompt = document.getElementById('bgPrompt').value;
    if (!prompt) {
      this.showToast('Please enter a description', 'error');
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/backgrounds/search?q=' + encodeURIComponent(prompt));
      const data = await response.json();

      if (data.success && data.results?.length > 0) {
        document.getElementById('bgSearchResults').classList.remove('hidden');
        document.getElementById('bgResultsGrid').innerHTML = data.results.map(bg => `
          <div class="result-item" data-url="http://localhost:3001${bg.location?.url || '/api/backgrounds/image/' + bg.imagePath}">
            <img src="http://localhost:3001${bg.location?.url || '/api/backgrounds/image/' + bg.imagePath}" alt="${bg.prompt}">
          </div>
        `).join('');

        document.querySelectorAll('.result-item').forEach(item => {
          item.addEventListener('click', () => {
            this.setBackgroundFromUrl(item.dataset.url);
            this.closeModals();
          });
        });
      } else {
        this.showToast('No backgrounds found. Try generating a new one.', 'warning');
      }
    } catch (error) {
      this.showToast('Failed to search backgrounds', 'error');
    }
  }

  async generateBackground() {
    const prompt = document.getElementById('bgPrompt').value;
    const category = document.getElementById('bgCategory').value;
    const style = document.getElementById('bgStyle').value;

    if (!prompt) {
      this.showToast('Please enter a description', 'error');
      return;
    }

    // Add instruction to not include any text in the background
    const enhancedPrompt = `${prompt}. No text, no words, no letters, no writing, no typography, no watermarks, pure background image only.`;

    document.getElementById('bgSearchResults').classList.add('hidden');
    document.getElementById('bgGenerating').classList.remove('hidden');

    try {
      const response = await fetch('http://localhost:3001/api/backgrounds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          category,
          style,
          width: this.canvasWidth,
          height: this.canvasHeight,
          forceNew: true
        })
      });

      const data = await response.json();

      if (data.success && data.background) {
        const imageUrl = `http://localhost:3001${data.background.location?.url || '/api/backgrounds/image/' + data.background.imagePath}`;
        this.setBackgroundFromUrl(imageUrl);
        this.closeModals();
        this.showToast('Background generated successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to generate');
      }
    } catch (error) {
      this.showToast(error.message || 'Failed to generate background', 'error');
    } finally {
      document.getElementById('bgGenerating').classList.add('hidden');
    }
  }

  setBackgroundFromUrl(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.background.type = 'image';
      this.background.value = url;
      this.background.image = img;

      document.getElementById('bgPreview').classList.remove('hidden');
      document.getElementById('bgPreviewImg').src = url;

      // Show fit and blur options
      document.getElementById('bgFitOptions').classList.remove('hidden');
      document.getElementById('bgBlurOption').classList.remove('hidden');

      document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.bg-type-btn[data-bg-type="image"]').classList.add('active');
      document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
      document.getElementById('bgImageOptions').classList.add('active');

      this.render();
      this.saveState();
    };
    img.onerror = () => {
      this.showToast('Failed to load background image', 'error');
    };
    img.src = url;
  }

  // ==================== AI TEMPLATE GENERATOR ====================

  async generateTemplateFromText() {
    const description = document.getElementById('templateDescription').value;

    if (!description) {
      this.showToast('Please enter a description for your template', 'error');
      return;
    }

    const generateBtn = document.getElementById('generateTemplateBtn');
    const generatingState = document.getElementById('templateGenerating');

    // Show loading state
    generateBtn.disabled = true;
    generatingState.classList.remove('hidden');

    try {
      const response = await fetch('http://localhost:3001/api/backgrounds/text-to-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          width: this.canvasWidth,
          height: this.canvasHeight,
          platform: document.querySelector('.platform-btn.active')?.dataset.platform || 'instagram',
          contentType: 'post'
        })
      });

      const data = await response.json();

      if (data.success && data.elements) {
        // Ask user if they want to replace or add elements
        const shouldReplace = this.elements.length === 0 || confirm('Replace current elements with AI generated template?');

        if (shouldReplace) {
          // Clear existing elements
          this.elements = [];
          this.placeholders = {};
        }

        // Add generated elements
        console.log('=== AI GENERATED ELEMENTS RAW DATA ===');
        console.log('Canvas size:', this.canvasWidth, 'x', this.canvasHeight);
        console.log('Number of elements:', data.elements.length);

        data.elements.forEach((el, index) => {
          // Ensure unique ID
          el.id = `${el.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // LOG: Element position data
          console.log(`Element ${index} [${el.type}] "${el.name || el.text?.substring(0, 20)}":`, {
            x: el.x,
            y: el.y,
            width: el.width,
            height: el.height,
            textAlign: el.textAlign,
            // Check for nested properties (wrong format)
            hasNestedPosition: !!el.position,
            hasNestedSize: !!el.size,
            positionObj: el.position,
            sizeObj: el.size
          });

          // FIX: If AI returned nested structure, flatten it
          if (el.position && typeof el.position === 'object') {
            console.warn('⚠️ Element has nested position - flattening!');
            el.x = el.position.x;
            el.y = el.position.y;
            delete el.position;
          }
          if (el.size && typeof el.size === 'object') {
            console.warn('⚠️ Element has nested size - flattening!');
            el.width = el.size.width;
            el.height = el.size.height;
            delete el.size;
          }
          if (el.content && !el.text) {
            console.warn('⚠️ Element has "content" instead of "text" - fixing!');
            el.text = el.content;
            delete el.content;
          }
          if (el.typography && typeof el.typography === 'object') {
            console.warn('⚠️ Element has nested typography - flattening!');
            Object.assign(el, el.typography);
            delete el.typography;
          }
          if (el.style && typeof el.style === 'object') {
            console.warn('⚠️ Element has nested style - flattening!');
            Object.assign(el, el.style);
            delete el.style;
          }

          // Ensure x is centered for center-aligned text
          if (el.type === 'text' && (!el.textAlign || el.textAlign === 'center')) {
            const expectedX = Math.round(this.canvasWidth / 2);
            if (el.x !== expectedX) {
              console.warn(`⚠️ Centering text element: x was ${el.x}, setting to ${expectedX}`);
              el.x = expectedX;
            }
          }

          // FIX: Limit width to safe maximum (canvas - 120px margin)
          const maxSafeWidth = this.canvasWidth - 120;
          if (el.width > maxSafeWidth) {
            console.warn(`⚠️ Width too large: ${el.width}, limiting to ${maxSafeWidth}`);
            el.width = maxSafeWidth;
          }

          // FIX: Ensure y position is not too close to edges
          const elPadding = el.padding || 0;
          const minY = 80 + elPadding;
          const maxY = this.canvasHeight - 80 - elPadding;
          if (el.y < minY) {
            console.warn(`⚠️ y too close to top: ${el.y}, setting to ${minY}`);
            el.y = minY;
          } else if (el.y > maxY) {
            console.warn(`⚠️ y too close to bottom: ${el.y}, setting to ${maxY}`);
            el.y = maxY;
          }

          console.log(`Element ${index} AFTER FIX:`, { x: el.x, y: el.y, width: el.width });

          // Handle image elements
          if (el.type === 'image' && el.src) {
            const img = new Image();
            img.onload = () => {
              el.image = img;
              this.render();
            };
            img.src = el.src;
          }

          this.elements.push(el);
        });

        console.log('=== FINAL ELEMENTS ARRAY ===');
        this.elements.forEach((el, i) => {
          console.log(`[${i}] ${el.type} x=${el.x} y=${el.y} w=${el.width}`);
        });

        // Apply suggested background if provided
        if (data.suggestedBackground && shouldReplace) {
          if (data.suggestedBackground.type === 'color') {
            this.background.type = 'color';
            this.background.value = data.suggestedBackground.value;
            document.getElementById('bgColor').value = data.suggestedBackground.value;
          } else if (data.suggestedBackground.type === 'gradient') {
            this.background.type = 'gradient';
            this.background.value = data.suggestedBackground.value;
            if (data.suggestedBackground.value.start) {
              document.getElementById('gradientStart').value = data.suggestedBackground.value.start;
              document.getElementById('gradientEnd').value = data.suggestedBackground.value.end;
            }
          }
        }

        // Update template name if suggested
        if (data.templateName && shouldReplace) {
          document.getElementById('templateName').value = data.templateName;
        }

        this.render();
        this.renderLayers();
        this.saveState();
        this.closeModals();
        this.showToast('Template generated successfully!', 'success');
      } else {
        throw new Error(data.error || 'Failed to generate template');
      }
    } catch (error) {
      console.error('Template generation error:', error);
      this.showToast(error.message || 'Failed to generate template', 'error');
    } finally {
      generateBtn.disabled = false;
      generatingState.classList.add('hidden');
    }
  }

  // ==================== AI CHAT PANEL ====================

  setupAIChatListeners() {
    const chatPanel = document.getElementById('aiChatPanel');
    const chatToggle = document.getElementById('aiChatToggle');
    const chatClose = document.getElementById('closeChatBtn');
    const chatInput = document.getElementById('aiChatInput');
    const chatSend = document.getElementById('aiChatSend');

    // Toggle chat panel
    chatToggle?.addEventListener('click', () => {
      chatPanel?.classList.add('open');
      chatInput?.focus();
    });

    // Close chat panel
    chatClose?.addEventListener('click', () => {
      chatPanel?.classList.remove('open');
    });

    // Send message on Enter
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendAIChatMessage();
      }
    });

    // Send button click
    chatSend?.addEventListener('click', () => this.sendAIChatMessage());
  }

  async sendAIChatMessage() {
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');
    const messagesContainer = document.getElementById('aiChatMessages');

    const message = input.value.trim();
    if (!message) return;

    // Disable input while processing
    input.disabled = true;
    sendBtn.disabled = true;
    input.value = '';

    // Add user message to chat
    this.addChatMessage(message, 'user');

    // Add typing indicator
    const typingId = this.addTypingIndicator();

    try {
      // Prepare current template state
      const currentTemplate = {
        width: this.canvasWidth,
        height: this.canvasHeight,
        elements: this.elements.map(el => {
          const copy = { ...el };
          delete copy.image;
          return copy;
        }),
        background: {
          type: this.background.type,
          value: this.background.value
        }
      };

      // Call AI edit endpoint
      const response = await fetch('http://localhost:3001/api/backgrounds/edit-template-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: currentTemplate,
          instruction: message
        })
      });

      const result = await response.json();

      // Remove typing indicator
      this.removeTypingIndicator(typingId);

      if (result.success) {
        // Apply changes
        if (result.elements) {
          this.elements = result.elements.map(el => {
            if (el.type === 'image' && el.src) {
              const img = new Image();
              img.onload = () => this.render();
              img.src = el.src;
              el.image = img;
            }
            return el;
          });
        }

        // Handle background changes
        if (result.background && result.background.value !== 'unchanged') {
          if (result.background.type === 'color') {
            this.background.type = 'color';
            this.background.value = result.background.value;
            this.background.image = null;
          } else if (result.background.type === 'gradient') {
            this.background.type = 'gradient';
            this.background.value = result.background.value;
            this.background.image = null;
          }
        }

        // Load new background if generated
        if (result.newBackground && result.newBackground.url) {
          this.setBackgroundFromUrl(`http://localhost:3001${result.newBackground.url}`);
        }

        // Render changes
        this.render();
        this.renderLayers();
        this.saveState();

        // Add AI response with changes
        let responseHtml = '<p>Done! I made the following changes:</p>';
        if (result.changes && result.changes.length > 0) {
          responseHtml += '<ul class="changes-list">';
          result.changes.forEach(change => {
            responseHtml += `<li>${change}</li>`;
          });
          responseHtml += '</ul>';
        } else {
          responseHtml += '<p>Changes applied successfully.</p>';
        }
        this.addChatMessage(responseHtml, 'assistant', true);

      } else {
        throw new Error(result.error || 'Failed to process your request');
      }

    } catch (error) {
      console.error('AI Chat error:', error);
      this.removeTypingIndicator(typingId);
      this.addChatMessage(`Sorry, I couldn't process that request. ${error.message}`, 'assistant');
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  addChatMessage(content, type = 'assistant', isHtml = false) {
    const messagesContainer = document.getElementById('aiChatMessages');

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${type}`;

    const avatarIcon = type === 'user' ? 'user' : 'robot';
    messageDiv.innerHTML = `
      <div class="ai-message-avatar">
        <i class="fas fa-${avatarIcon}"></i>
      </div>
      <div class="ai-message-content">
        ${isHtml ? content : `<p>${content}</p>`}
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  addTypingIndicator() {
    const messagesContainer = document.getElementById('aiChatMessages');
    const typingId = `typing_${Date.now()}`;

    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message assistant';
    typingDiv.id = typingId;
    typingDiv.innerHTML = `
      <div class="ai-message-avatar">
        <i class="fas fa-robot"></i>
      </div>
      <div class="ai-message-content">
        <div class="ai-typing">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;

    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    return typingId;
  }

  removeTypingIndicator(typingId) {
    const typingDiv = document.getElementById(typingId);
    if (typingDiv) {
      typingDiv.remove();
    }
  }

  // ==================== UTILITIES ====================

  closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('show');
    });
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

  loadDefaultElements() {
    this.elements = [
      {
        id: 'main_text',
        type: 'text',
        name: 'Headline',
        x: this.canvasWidth / 2,
        y: this.canvasHeight / 2 - 80,
        width: Math.min(900, this.canvasWidth - 80),
        text: 'Your Headline Here',
        fontSize: Math.min(96, this.canvasWidth / 11),
        fontFamily: 'Inter',
        fontWeight: 'bold',
        color: '#1f2937',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        rotation: 0,
        visible: true,
        locked: false,
        dynamicProperties: {}
      },
      {
        id: 'subtitle',
        type: 'text',
        name: 'Subtitle',
        x: this.canvasWidth / 2,
        y: this.canvasHeight / 2 + 60,
        width: Math.min(800, this.canvasWidth - 100),
        text: 'Add a compelling subtitle or description',
        fontSize: Math.min(48, this.canvasWidth / 22),
        fontFamily: 'Inter',
        fontWeight: 'normal',
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 1.4,
        letterSpacing: 0,
        rotation: 0,
        visible: true,
        locked: false,
        dynamicProperties: {}
      }
    ];

    this.renderLayers();
    this.saveState();
  }

  // ==================== UNIFIED IMAGE PICKER ====================

  setupImagePicker() {
    const modal = document.getElementById('imagePickerModal');
    if (!modal) return;

    // Tab switching
    modal.querySelectorAll('.picker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        modal.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
        modal.querySelectorAll('.picker-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');

        // Map tab names to content IDs
        const tabContentMap = {
          'upload': 'pickerUpload',
          'library': 'pickerLibrary',
          'search': 'pickerSearch',
          'ai': 'pickerAI'
        };
        const contentId = tabContentMap[tab.dataset.tab];
        if (contentId) {
          document.getElementById(contentId).classList.add('active');
        }
      });
    });

    // Upload tab - file input
    document.getElementById('browseImageBtn')?.addEventListener('click', () => {
      document.getElementById('imagePickerFile').click();
    });

    document.getElementById('imagePickerFile')?.addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.handleImageFile(e.target.files[0]);
      }
    });

    // Drag and drop
    const dropzone = document.getElementById('imageDropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files[0]) {
          this.handleImageFile(e.dataTransfer.files[0]);
        }
      });
    }

    // Library categories
    modal.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadLibraryImages(btn.dataset.category);
      });
    });

    // Search
    document.getElementById('searchImagesBtn')?.addEventListener('click', () => {
      const keyword = document.getElementById('imageSearchInput').value;
      if (keyword) this.searchImages(keyword);
    });

    document.getElementById('imageSearchInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const keyword = e.target.value;
        if (keyword) this.searchImages(keyword);
      }
    });

    modal.querySelectorAll('.suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('imageSearchInput').value = chip.dataset.keyword;
        this.searchImages(chip.dataset.keyword);
      });
    });

    // Generate AI image
    document.getElementById('generateAIImageBtn')?.addEventListener('click', () => {
      this.generateAIImage();
    });

    // Improve prompt button
    document.getElementById('improvePromptBtn')?.addEventListener('click', () => {
      this.improvePrompt();
    });

    // Quick prompt chips
    modal.querySelectorAll('.quick-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.getElementById('aiImagePrompt').value = chip.dataset.prompt;
      });
    });

    // Fit buttons
    modal.querySelectorAll('.fit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.fit-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedFitMode = btn.dataset.fit;
        this.updateImagePreview();
      });
    });

    // Clear preview
    document.getElementById('clearPreviewBtn')?.addEventListener('click', () => {
      this.clearImagePreview();
    });

    // Apply image
    document.getElementById('applyImageBtn')?.addEventListener('click', () => {
      this.applySelectedImage();
    });

    // Crop button
    document.getElementById('enableCropBtn')?.addEventListener('click', () => {
      this.toggleCropMode();
    });
  }

  openImagePicker(target, title = 'Select Image') {
    this.imagePickerTarget = target; // 'background', 'element', or element object
    this.selectedImageUrl = null;
    this.selectedImageFile = null;
    this.selectedFitMode = 'cover';
    this.cropArea = null;

    document.getElementById('imagePickerTitle').textContent = title;
    document.getElementById('imagePickerModal').classList.add('show');
    document.getElementById('imagePreviewSection').style.display = 'none';
    document.getElementById('applyImageBtn').disabled = true;

    // Reset to upload tab
    document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.picker-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.picker-tab[data-tab="upload"]').classList.add('active');
    document.getElementById('pickerUpload').classList.add('active');

    // Load library
    this.loadLibraryImages('all');
  }

  handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      this.showToast('Please select an image file', 'error');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.showToast('Image must be less than 10MB', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.selectedImageUrl = e.target.result;
      this.selectedImageFile = file;
      this.showImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  async loadLibraryImages(category) {
    const grid = document.getElementById('libraryGrid');
    grid.innerHTML = '<div class="library-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';

    try {
      // Use combined assets API (local uploads + background engine)
      const params = new URLSearchParams({ limit: 30 });
      if (category && category !== 'all') {
        params.append('category', category);
      }

      console.log('Loading library images, category:', category);
      const response = await fetch(`/api/assets/list?${params}`);
      const data = await response.json();
      console.log('Library API response:', data);

      if (data.success && data.assets?.length > 0) {
        grid.innerHTML = data.assets.map(asset => {
          const sourceIcon = asset.source === 'local' ? 'fa-folder' : 'fa-cloud';
          const sourceBadge = asset.source === 'local' ? 'local' : 'cloud';
          return `
            <div class="library-item" data-url="${asset.url}" title="${asset.name || ''}">
              <img src="${asset.thumbnail || asset.url}" alt="${asset.name || 'Image'}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text fill=%22%23666%22 x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22>No Image</text></svg>'">
              <span class="source-badge ${sourceBadge}"><i class="fas ${sourceIcon}"></i></span>
            </div>
          `;
        }).join('');

        grid.querySelectorAll('.library-item').forEach(item => {
          item.addEventListener('click', () => {
            grid.querySelectorAll('.library-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            this.selectedImageUrl = item.dataset.url;
            this.showImagePreview(item.dataset.url);
          });
        });
      } else {
        grid.innerHTML = '<div class="library-loading"><i class="fas fa-images"></i><p>No images found in library</p><small>Upload images or check background engine connection</small></div>';
      }
    } catch (error) {
      console.error('Library load error:', error);
      grid.innerHTML = `<div class="library-loading"><i class="fas fa-exclamation-circle"></i><p>Failed to load library</p><small>${error.message}</small></div>`;
    }
  }

  async searchImages(keyword) {
    const grid = document.getElementById('searchResultsGrid');
    grid.innerHTML = '<div class="search-placeholder"><i class="fas fa-spinner fa-spin"></i><p>Searching...</p></div>';

    try {
      // Use combined assets search API
      const response = await fetch(`/api/assets/search?q=${encodeURIComponent(keyword)}&limit=30`);
      const data = await response.json();

      if (data.success && data.results?.length > 0) {
        grid.innerHTML = data.results.map(asset => {
          const sourceIcon = asset.source === 'local' ? 'fa-folder' : 'fa-cloud';
          const sourceBadge = asset.source === 'local' ? 'local' : 'cloud';
          return `
            <div class="search-result-item" data-url="${asset.url}" title="${asset.name || ''}">
              <img src="${asset.thumbnail || asset.url}" alt="${asset.name || keyword}" loading="lazy">
              <span class="source-badge ${sourceBadge}"><i class="fas ${sourceIcon}"></i></span>
            </div>
          `;
        }).join('');

        grid.querySelectorAll('.search-result-item').forEach(item => {
          item.addEventListener('click', () => {
            grid.querySelectorAll('.search-result-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            this.selectedImageUrl = item.dataset.url;
            this.showImagePreview(item.dataset.url);
          });
        });
      } else {
        grid.innerHTML = '<div class="search-placeholder"><i class="fas fa-search"></i><p>No images found for "' + keyword + '"</p></div>';
      }
    } catch (error) {
      console.error('Search error:', error);
      grid.innerHTML = '<div class="search-placeholder"><i class="fas fa-exclamation-circle"></i><p>Search failed</p></div>';
    }
  }

  async generateAIImage() {
    const prompt = document.getElementById('aiImagePrompt').value;
    if (!prompt) {
      this.showToast('Please describe the background you want', 'error');
      return;
    }

    // Add instruction to not include any text in the background
    const enhancedPrompt = `${prompt}. No text, no words, no letters, no writing, no typography, no watermarks, pure background image only.`;

    const category = document.getElementById('aiCategory')?.value || 'general';
    const style = document.getElementById('aiStyle')?.value || 'vibrant';
    const btn = document.getElementById('generateAIImageBtn');
    const resultsDiv = document.getElementById('aiImageResults');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    resultsDiv.innerHTML = '<div class="library-loading"><i class="fas fa-spinner fa-spin"></i><p>Creating your background with AI...</p></div>';

    try {
      const response = await fetch('http://localhost:3001/api/backgrounds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          category: category,
          style: style,
          width: this.canvasWidth,
          height: this.canvasHeight,
          forceNew: true
        })
      });

      const data = await response.json();

      console.log('AI Generate response:', data);

      if (data.success) {
        let imageUrl;

        if (data.type === 'generated' && data.background) {
          // Newly generated background
          imageUrl = data.background.location?.url || `http://localhost:3001/api/backgrounds/image/${data.background.imagePath}`;
        } else if (data.type === 'existing' && data.suggestions?.length > 0) {
          // Found existing matches
          imageUrl = data.suggestions[0].location?.url || `http://localhost:3001/api/backgrounds/image/${data.suggestions[0].imagePath}`;
        }

        // Ensure URL is fully qualified
        if (imageUrl && imageUrl.startsWith('/')) {
          imageUrl = `http://localhost:3001${imageUrl}`;
        }

        console.log('Generated image URL:', imageUrl);

        if (imageUrl) {
          resultsDiv.innerHTML = `
            <div class="ai-generated-result">
              <div class="ai-result-item selected" data-url="${imageUrl}">
                <img src="${imageUrl}" alt="AI Generated" onerror="this.parentElement.innerHTML='<div class=\\'error-placeholder\\'><i class=\\'fas fa-exclamation-triangle\\'></i><p>Image failed to load</p></div>'">
              </div>
              <p class="ai-result-info">Click "Apply Image" to use this background</p>
            </div>
          `;
          this.selectedImageUrl = imageUrl;
          this.showImagePreview(imageUrl);

          resultsDiv.querySelector('.ai-result-item')?.addEventListener('click', function() {
            this.classList.add('selected');
          });

          this.showToast('Background generated successfully!', 'success');
        } else {
          throw new Error('No image URL in response');
        }
      } else {
        throw new Error(data.error || 'Generation failed');
      }
    } catch (error) {
      console.error('AI generation error:', error);
      resultsDiv.innerHTML = '<div class="library-loading"><i class="fas fa-exclamation-circle"></i><p>Failed to generate background</p></div>';
      this.showToast('Failed to generate AI background: ' + error.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Generate Background';
    }
  }

  async improvePrompt() {
    const promptInput = document.getElementById('aiImagePrompt');
    const prompt = promptInput.value;

    if (!prompt) {
      this.showToast('Please enter a prompt first', 'warning');
      return;
    }

    const btn = document.getElementById('improvePromptBtn');
    const suggestionsDiv = document.getElementById('promptSuggestions');
    const suggestionList = document.getElementById('suggestionList');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      const response = await fetch('http://localhost:3001/api/backgrounds/improve-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });

      const data = await response.json();

      if (data.success && data.suggestions?.length > 0) {
        suggestionsDiv.style.display = 'block';
        suggestionList.innerHTML = data.suggestions.map(suggestion => `
          <div class="suggestion-item" data-prompt="${suggestion}">${suggestion}</div>
        `).join('');

        suggestionList.querySelectorAll('.suggestion-item').forEach(item => {
          item.addEventListener('click', () => {
            promptInput.value = item.dataset.prompt;
            suggestionsDiv.style.display = 'none';
          });
        });
      } else {
        this.showToast('No suggestions available', 'info');
      }
    } catch (error) {
      console.error('Improve prompt error:', error);
      this.showToast('Failed to get suggestions', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-magic"></i> Improve';
    }
  }

  showImagePreview(url) {
    const previewSection = document.getElementById('imagePreviewSection');
    const canvas = document.getElementById('imagePreviewCanvas');
    const ctx = canvas.getContext('2d');

    previewSection.style.display = 'block';
    document.getElementById('applyImageBtn').disabled = false;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.previewImage = img;

      // Set canvas size based on image aspect ratio
      const maxSize = 250;
      let w = img.width;
      let h = img.height;

      if (w > h) {
        if (w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
      } else {
        if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
      }

      canvas.width = w;
      canvas.height = h;

      // Update info
      document.getElementById('imageSizeInfo').textContent = `${img.width} x ${img.height}px`;
      document.getElementById('imageAspectInfo').textContent = this.getAspectRatioString(img.width, img.height);

      this.updateImagePreview();
    };
    img.src = url;
  }

  updateImagePreview() {
    if (!this.previewImage) return;

    const canvas = document.getElementById('imagePreviewCanvas');
    const ctx = canvas.getContext('2d');
    const img = this.previewImage;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw checkerboard background for transparency
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply fit mode preview
    const fitMode = this.selectedFitMode || 'cover';
    const imgAspect = img.width / img.height;
    const canvasAspect = canvas.width / canvas.height;

    let drawWidth, drawHeight, drawX, drawY;

    switch (fitMode) {
      case 'fill':
      case 'stretch':
        drawWidth = canvas.width;
        drawHeight = canvas.height;
        drawX = 0;
        drawY = 0;
        break;

      case 'cover':
        if (imgAspect > canvasAspect) {
          drawHeight = canvas.height;
          drawWidth = canvas.height * imgAspect;
        } else {
          drawWidth = canvas.width;
          drawHeight = canvas.width / imgAspect;
        }
        drawX = (canvas.width - drawWidth) / 2;
        drawY = (canvas.height - drawHeight) / 2;
        break;

      case 'center':
      case 'none':
        drawWidth = Math.min(img.width, canvas.width);
        drawHeight = Math.min(img.height, canvas.height);
        if (img.width > canvas.width || img.height > canvas.height) {
          const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
          drawWidth = img.width * scale;
          drawHeight = img.height * scale;
        }
        drawX = (canvas.width - drawWidth) / 2;
        drawY = (canvas.height - drawHeight) / 2;
        break;

      case 'contain':
      default:
        if (imgAspect > canvasAspect) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / imgAspect;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * imgAspect;
        }
        drawX = (canvas.width - drawWidth) / 2;
        drawY = (canvas.height - drawHeight) / 2;
        break;
    }

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  }

  clearImagePreview() {
    this.selectedImageUrl = null;
    this.selectedImageFile = null;
    this.previewImage = null;
    document.getElementById('imagePreviewSection').style.display = 'none';
    document.getElementById('applyImageBtn').disabled = true;

    // Clear selections
    document.querySelectorAll('.library-item, .search-result-item, .ai-result-item').forEach(item => {
      item.classList.remove('selected');
    });
  }

  applySelectedImage() {
    if (!this.selectedImageUrl) return;

    const target = this.imagePickerTarget;

    if (target === 'background') {
      // Apply as background with fitMode
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.background.type = 'image';
        this.background.value = this.selectedImageUrl;
        this.background.image = img;
        this.background.fitMode = this.selectedFitMode;

        document.getElementById('bgPreview').classList.remove('hidden');
        document.getElementById('bgPreviewImg').src = this.selectedImageUrl;

        // Show fit and blur options
        document.getElementById('bgFitOptions').classList.remove('hidden');
        document.getElementById('bgBlurOption').classList.remove('hidden');

        // Update active fit button
        document.querySelectorAll('.bg-fit-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.bg-fit-btn[data-fit="${this.selectedFitMode}"]`)?.classList.add('active');

        document.querySelectorAll('.bg-type-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.bg-type-btn[data-bg-type="image"]')?.classList.add('active');
        document.querySelectorAll('.bg-options').forEach(opt => opt.classList.remove('active'));
        document.getElementById('bgImageOptions')?.classList.add('active');

        this.render();
        this.saveState();
      };
      img.src = this.selectedImageUrl;
    } else if (target && typeof target === 'object') {
      // Apply to specific element
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        target.image = img;
        target.src = this.selectedImageUrl;
        target.objectFit = this.selectedFitMode;
        if (this.cropArea) {
          target.cropArea = this.cropArea;
        }
        this.render();
        this.saveState();
      };
      img.src = this.selectedImageUrl;
    } else if (this.selectedElement && this.selectedElement.type === 'image') {
      // Apply to selected image element
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.selectedElement.image = img;
        this.selectedElement.src = this.selectedImageUrl;
        this.selectedElement.objectFit = this.selectedFitMode;
        if (this.cropArea) {
          this.selectedElement.cropArea = this.cropArea;
        }
        this.render();
        this.saveState();
      };
      img.src = this.selectedImageUrl;
    }

    // Close modal
    document.getElementById('imagePickerModal').classList.remove('show');
    this.showToast('Image applied successfully', 'success');
  }

  toggleCropMode() {
    // Basic crop mode toggle - can be enhanced with actual crop UI
    this.showToast('Custom crop mode - drag to select area', 'info');
  }

  getAspectRatioString(width, height) {
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const divisor = gcd(width, height);
    return `${width / divisor}:${height / divisor}`;
  }
}

// Initialize editor
const editor = new TemplateEditor();
