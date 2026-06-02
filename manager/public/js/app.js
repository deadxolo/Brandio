// Social Media Manager - Main Application

class App {
  constructor() {
    this.currentBusiness = null;
    this.businesses = [];
    // Allow deep-linking from other pages, e.g. /dashboard#posts
    const validPages = ['dashboard', 'posts', 'templates', 'schedule', 'assets', 'settings'];
    const fromHash = (window.location.hash || '').replace('#', '');
    this.currentPage = validPages.includes(fromHash) ? fromHash : 'dashboard';
    this.services = {};
    this.templates = [];
    this.imageCache = new Map();

    this.init();
  }

  async init() {
    // Load services configuration
    await this.loadServices();

    // Load businesses
    await this.loadBusinesses();

    // Setup event listeners
    this.setupEventListeners();

    // Render initial content
    this.renderBusinessTabs();

    if (this.businesses.length > 0) {
      this.selectBusiness(this.businesses[0].id);
    } else {
      this.renderEmptyState();
    }
  }

  async loadServices() {
    try {
      const response = await fetch('/api/services');
      const data = await response.json();
      this.services = data.services;
      this.platforms = data.platforms;
    } catch (error) {
      console.error('Failed to load services:', error);
    }
  }

  async loadBusinesses() {
    try {
      const response = await fetch('/api/businesses');
      const data = await response.json();
      this.businesses = data.businesses || [];
    } catch (error) {
      console.error('Failed to load businesses:', error);
      this.businesses = [];
    }
  }

  setupEventListeners() {
    // Navigation items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        this.navigateTo(page);
      });
    });

    // Add business button
    document.getElementById('addBusinessBtn').addEventListener('click', () => {
      this.openBusinessModal();
    });

    // Modal close buttons
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeModals();
      });
    });

    // Modal backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => {
        this.closeModals();
      });
    });

    // Business form submission
    document.getElementById('businessForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveBusiness();
    });

    // Form tabs
    document.querySelectorAll('.form-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchFormTab(tab.dataset.tab);
      });
    });

    // Logo file input
    document.getElementById('businessLogo').addEventListener('change', (e) => {
      this.previewLogo(e.target.files[0]);
    });

    // Color inputs
    document.querySelectorAll('.color-input input[type="color"]').forEach(input => {
      input.addEventListener('input', (e) => {
        e.target.parentElement.querySelector('.color-value').textContent = e.target.value.toUpperCase();
      });
    });
  }

  // Business Tabs
  renderBusinessTabs() {
    const container = document.getElementById('businessTabs');
    container.innerHTML = this.businesses.map(business => `
      <button class="business-tab ${this.currentBusiness?.id === business.id ? 'active' : ''}" data-id="${business.id}">
        ${business.logo
          ? `<img src="${business.logo}" alt="${business.name}" class="tab-logo">`
          : `<span class="tab-icon"><i class="fas fa-building"></i></span>`
        }
        <span class="tab-name">${business.name}</span>
        <span class="close-tab" title="Edit Business"><i class="fas fa-pen"></i></span>
      </button>
    `).join('');

    // Add click events
    container.querySelectorAll('.business-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        if (e.target.closest('.close-tab')) {
          e.stopPropagation();
          this.editBusiness(tab.dataset.id);
        } else {
          this.selectBusiness(tab.dataset.id);
        }
      });
    });
  }

  selectBusiness(businessId) {
    this.currentBusiness = this.businesses.find(b => b.id === businessId);
    this.renderBusinessTabs();
    this.navigateTo(this.currentPage);
  }

  // Navigation
  navigateTo(page) {
    // Analytics is a standalone page, not an in-dashboard SPA view.
    if (page === 'analytics') { window.location.href = '/analytics'; return; }

    this.currentPage = page;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Render page content
    this.renderPage(page);
  }

  renderPage(page) {
    const content = document.getElementById('contentArea');

    if (!this.currentBusiness && page !== 'dashboard') {
      content.innerHTML = this.getEmptyStateHTML();
      return;
    }

    switch (page) {
      case 'dashboard':
        this.renderDashboard();
        break;
      case 'posts':
        this.renderPosts();
        break;
      case 'templates':
        this.renderTemplates();
        break;
      case 'schedule':
        this.renderSchedule();
        break;
      case 'assets':
        this.renderAssets();
        break;
      case 'settings':
        this.renderSettings();
        break;
      default:
        this.renderDashboard();
    }
  }

  // Dashboard
  async renderDashboard() {
    const content = document.getElementById('contentArea');

    if (!this.currentBusiness) {
      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Dashboard</h1>
        </div>
        ${this.getEmptyStateHTML()}
      `;
      return;
    }

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${this.currentBusiness.name} Dashboard</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="app.openCreatePostModal()">
            <i class="fas fa-plus"></i> Create Post
          </button>
        </div>
      </div>

      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading dashboard...</p>
      </div>
    `;

    try {
      const response = await fetch(`/api/dashboard/stats/${this.currentBusiness.id}`);
      const data = await response.json();

      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">${this.currentBusiness.name} Dashboard</h1>
          <div class="page-actions">
            <button class="btn btn-primary" onclick="app.openCreatePostModal()">
              <i class="fas fa-plus"></i> Create Post
            </button>
          </div>
        </div>

        <!-- AI Template Generation Section -->
        <div class="ai-prompt-section" style="background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: var(--shadow);">
          <div style="display: flex; align-items: flex-start; gap: 14px; margin-bottom: 16px;">
            <div style="width: 44px; height: 44px; background: linear-gradient(135deg, #3B82F6, #1E40AF); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
              <i class="fas fa-wand-magic-sparkles" style="font-size: 20px; color: white;"></i>
            </div>
            <div>
              <h3 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">Create Template with AI</h3>
              <p style="font-size: 13px; color: var(--text-secondary);">Describe what you want and let AI generate a complete template</p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; margin-bottom: 12px;">
            <textarea id="aiPromptInput" placeholder="Describe your template... e.g., 'A festive Diwali sale post with bold headline and discount text'" rows="2" style="flex: 1; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--gray-50); color: var(--text-primary); font-size: 14px; resize: none; font-family: inherit;"></textarea>
            <button class="btn btn-primary" onclick="app.generateAITemplate()" style="white-space: nowrap;">
              <i class="fas fa-wand-magic-sparkles"></i> Generate
            </button>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <input type="text" id="aiHeadlineInput" placeholder="Headline (optional)" style="flex: 1; min-width: 140px; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--gray-50); color: var(--text-primary); font-size: 13px;">
            <input type="text" id="aiSubtextInput" placeholder="Subtext (optional)" style="flex: 1; min-width: 140px; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--gray-50); color: var(--text-primary); font-size: 13px;">
            <select id="aiPlatformSelect" style="padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--gray-50); color: var(--text-primary); font-size: 13px; cursor: pointer;">
              <option value="instagram">Instagram Post</option>
              <option value="instagram_story">Instagram Story</option>
              <option value="facebook">Facebook Post</option>
              <option value="twitter">Twitter Post</option>
              <option value="linkedin">LinkedIn Post</option>
            </select>
            <select id="aiStyleSelect" style="padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--gray-50); color: var(--text-primary); font-size: 13px; cursor: pointer;">
              <option value="vibrant">Vibrant</option>
              <option value="minimal">Minimal</option>
              <option value="festive">Festive</option>
              <option value="corporate">Corporate</option>
            </select>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue"><i class="fas fa-images"></i></div>
            <div class="stat-value">${data.stats.totalPosts}</div>
            <div class="stat-label">Total Posts</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
            <div class="stat-value">${data.stats.scheduledPosts}</div>
            <div class="stat-label">Scheduled</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
            <div class="stat-value">${data.stats.publishedPosts}</div>
            <div class="stat-label">Published</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple"><i class="fas fa-layer-group"></i></div>
            <div class="stat-value">${data.stats.templates}</div>
            <div class="stat-label">Templates</div>
          </div>
        </div>

        <div class="dashboard-grid${data.socialAccounts.length > 0 ? '' : ' single'}">
          <div class="card">
            <div class="card-header">
              <h3>Recent Posts</h3>
              <button class="btn btn-outline btn-sm" onclick="app.navigateTo('posts')">View All</button>
            </div>
            <div class="card-body">
              ${data.recentPosts.length > 0 ? `
                <ul class="activity-list">
                  ${data.recentPosts.map(post => `
                    <li class="activity-item" onclick="app.viewPost('${post.id}')" style="cursor: pointer;">
                      <div class="activity-thumbnail">
                        ${post.image_url
                          ? `<img src="${post.image_url}" alt="" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                             <div class="activity-thumbnail-placeholder" style="display: none;"><i class="fas fa-image"></i></div>`
                          : `<i class="fas fa-image" style="font-size: 20px; color: var(--gray-400);"></i>`
                        }
                      </div>
                      <div class="activity-content">
                        <div class="activity-title">${post.title || 'Untitled Post'}</div>
                        <div class="activity-meta">
                          ${post.platforms.map(p => `<i class="fab fa-${p}"></i>`).join(' ')}
                          <span class="post-status ${post.status}">${post.status}</span>
                        </div>
                      </div>
                    </li>
                  `).join('')}
                </ul>
              ` : `
                <div class="empty-state" style="padding: 40px;">
                  <i class="fas fa-images"></i>
                  <p>No posts yet. Create your first post!</p>
                </div>
              `}
            </div>
          </div>

          ${data.socialAccounts.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <h3>Connected Accounts</h3>
              <button class="btn btn-outline btn-sm" onclick="app.navigateTo('settings')">Manage</button>
            </div>
            <div class="card-body">
              <ul class="activity-list">
                ${data.socialAccounts.map(account => `
                  <li class="activity-item">
                    <div class="activity-icon post">
                      <i class="fab fa-${account.platform}"></i>
                    </div>
                    <div class="activity-content">
                      <div class="activity-title">${account.account_name || account.platform}</div>
                      <div class="activity-meta">Connected</div>
                    </div>
                  </li>
                `).join('')}
              </ul>
            </div>
          </div>
          ` : ''}
        </div>

        ${data.socialAccounts.length > 0 ? '' : `
          <a class="connect-hint" onclick="app.navigateTo('settings')">
            <i class="fas fa-link"></i>
            <span>No social accounts connected — connect one to publish and track analytics</span>
            <i class="fas fa-arrow-right"></i>
          </a>
        `}
      `;
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      content.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load dashboard</p></div>`;
    }
  }

  // Posts
  async renderPosts() {
    const content = document.getElementById('contentArea');

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Posts</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="app.openCreatePostModal()">
            <i class="fas fa-plus"></i> Create Post
          </button>
        </div>
      </div>

      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading posts...</p>
      </div>
    `;

    try {
      const response = await fetch(`/api/posts/${this.currentBusiness.id}`);
      const data = await response.json();
      const posts = data.posts || [];

      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Posts</h1>
          <div class="page-actions">
            <button class="btn btn-primary" onclick="app.openCreatePostModal()">
              <i class="fas fa-plus"></i> Create Post
            </button>
          </div>
        </div>

        <!-- Filter tabs -->
        <div class="filter-tabs" style="margin-bottom: 20px;">
          <button class="filter-tab active" data-status="all">All (${posts.length})</button>
          <button class="filter-tab" data-status="draft">Drafts (${posts.filter(p => p.status === 'draft').length})</button>
          <button class="filter-tab" data-status="scheduled">Scheduled (${posts.filter(p => p.status === 'scheduled').length})</button>
          <button class="filter-tab" data-status="published">Published (${posts.filter(p => p.status === 'published').length})</button>
        </div>

        ${posts.length > 0 ? `
          <div class="posts-grid" id="postsGrid">
            ${posts.map(post => this.renderPostCard(post)).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <i class="fas fa-images"></i>
            <h3>No posts yet</h3>
            <p>Create your first social media post</p>
            <button class="btn btn-primary" onclick="app.openCreatePostModal()">
              <i class="fas fa-plus"></i> Create Post
            </button>
          </div>
        `}
      `;

      // Setup filter tabs
      this.allPosts = posts;
      document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.filterPosts(tab.dataset.status);
        });
      });
    } catch (error) {
      console.error('Failed to load posts:', error);
      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Posts</h1>
        </div>
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <h3>Failed to load posts</h3>
          <p>Please try again later</p>
        </div>
      `;
    }
  }

  renderPostCard(post) {
    const platforms = post.platforms || ['instagram'];
    const createdDate = new Date(post.created_at).toLocaleDateString();
    const canPublish = post.status === 'draft' || post.status === 'ready';
    const isScheduled = post.status === 'scheduled';
    const isPublished = post.status === 'published';
    const scheduledDate = post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : '';

    return `
      <div class="post-card" data-id="${post.id}" data-status="${post.status}" onclick="app.viewPost('${post.id}')" style="cursor: pointer;">
        <div class="post-card-image">
          ${post.image_url
            ? `<img src="${post.image_url}" alt="${post.title || 'Post'}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="post-card-placeholder" style="display: none;"><i class="fas fa-image"></i></div>`
            : `<div class="post-card-placeholder"><i class="fas fa-image"></i></div>`
          }
          <div class="post-card-overlay">
            <button class="btn-icon" onclick="event.stopPropagation(); app.viewPost('${post.id}')" title="View">
              <i class="fas fa-eye"></i>
            </button>
            ${canPublish ? `
              <button class="btn-icon" style="background: var(--success); color: white;" onclick="event.stopPropagation(); app.publishPost('${post.id}')" title="Publish">
                <i class="fas fa-paper-plane"></i>
              </button>
            ` : ''}
            <button class="btn-icon" style="background: var(--danger); color: white;" onclick="event.stopPropagation(); app.deletePost('${post.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="post-card-body">
          <div class="post-card-title">${post.title || 'Untitled Post'}</div>
          <div class="post-card-date">${createdDate}</div>
          ${isScheduled && scheduledDate ? `
            <div class="post-card-scheduled" style="font-size: 11px; color: var(--warning); margin-top: 4px;">
              <i class="fas fa-clock"></i> ${scheduledDate}
            </div>
          ` : ''}
          <div class="post-card-meta">
            <div class="post-platforms">
              ${platforms.map(p => `<i class="fab fa-${p}"></i>`).join('')}
            </div>
            <span class="post-status ${post.status}">${post.status}</span>
          </div>
        </div>
        <div class="post-card-actions" style="display: flex; gap: 6px; padding: 8px 10px; border-top: 1px solid var(--border-color); background: var(--gray-50);">
          <button class="btn btn-outline btn-sm" style="flex: 1;" onclick="event.stopPropagation(); app.viewPost('${post.id}')">
            <i class="fas fa-eye"></i> View
          </button>
          ${canPublish ? `
            <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="event.stopPropagation(); app.publishPost('${post.id}')">
              <i class="fas fa-paper-plane"></i> Publish
            </button>
          ` : isPublished ? `
            <span class="btn btn-sm" style="flex: 1; background: var(--success); color: white; cursor: default; justify-content: center;">
              <i class="fas fa-check"></i> Published
            </span>
          ` : isScheduled ? `
            <span class="btn btn-sm" style="flex: 1; background: var(--warning); color: white; cursor: default; justify-content: center;">
              <i class="fas fa-clock"></i> Scheduled
            </span>
          ` : `
            <span class="btn btn-sm" style="flex: 1; background: var(--gray-400); color: white; cursor: default; justify-content: center;">
              ${post.status}
            </span>
          `}
          <button class="btn btn-sm" style="background: var(--danger); color: white;" onclick="event.stopPropagation(); app.deletePost('${post.id}')">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  filterPosts(status) {
    const grid = document.getElementById('postsGrid');
    if (!grid) return;

    let filteredPosts = this.allPosts;
    if (status !== 'all') {
      filteredPosts = this.allPosts.filter(p => p.status === status);
    }

    if (filteredPosts.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fas fa-filter"></i>
          <h3>No ${status} posts</h3>
          <p>Posts with "${status}" status will appear here</p>
        </div>
      `;
    } else {
      grid.innerHTML = filteredPosts.map(post => this.renderPostCard(post)).join('');
    }
  }

  async viewPost(postId) {
    try {
      const response = await fetch(`/api/posts/item/${postId}`);
      const data = await response.json();

      if (!data.success || !data.post) {
        this.showToast('Post not found', 'error');
        return;
      }

      const post = data.post;
      const isDraft = post.status === 'draft' || post.status === 'ready';
      const isPublished = post.status === 'published';
      const platforms = post.platforms || ['instagram'];

      // Remove existing modal if any
      const existingModal = document.getElementById('viewPostModal');
      if (existingModal) existingModal.remove();

      // Create fresh modal
      const modal = document.createElement('div');
      modal.id = 'viewPostModal';
      modal.className = 'modal show';

      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 550px;">
          <div class="modal-header">
            <h3>${post.title || 'Post Details'}</h3>
            <button class="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            ${post.image_url ? `
              <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden; background: var(--gray-100);">
                <img src="${post.image_url}" alt="Post" style="width: 100%; display: block;">
              </div>
            ` : `
              <div style="margin-bottom: 16px; border-radius: 8px; background: var(--gray-100); height: 200px; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-image" style="font-size: 48px; color: var(--gray-300);"></i>
              </div>
            `}

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
              <div style="padding: 12px; background: var(--gray-50); border-radius: 8px;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Status</div>
                <span class="post-status ${post.status}" style="font-size: 13px;">${post.status}</span>
              </div>
              <div style="padding: 12px; background: var(--gray-50); border-radius: 8px;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Platforms</div>
                <div style="font-size: 16px;">
                  ${platforms.map(p => `<i class="fab fa-${p}" style="margin-right: 6px; color: var(--text-primary);"></i>`).join('') || '<span style="color: var(--gray-400);">None</span>'}
                </div>
              </div>
            </div>

            <div style="padding: 12px; background: var(--gray-50); border-radius: 8px; margin-bottom: 12px;">
              <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Created</div>
              <div style="font-size: 13px; color: var(--text-primary);">${new Date(post.created_at).toLocaleString()}</div>
            </div>

            ${post.caption ? `
              <div style="padding: 12px; background: var(--gray-50); border-radius: 8px;">
                <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Caption</div>
                <p style="margin: 0; font-size: 13px; color: var(--text-primary); white-space: pre-wrap;">${post.caption}</p>
              </div>
            ` : ''}
          </div>
          <div class="modal-footer" style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-outline" id="viewPostClose">
              <i class="fas fa-times"></i> Close
            </button>
            <button class="btn btn-danger" id="viewPostDelete">
              <i class="fas fa-trash"></i> Delete
            </button>
            ${isDraft ? `
              <button class="btn btn-primary" id="viewPostPublish">
                <i class="fas fa-paper-plane"></i> Publish
              </button>
            ` : isPublished ? `
              <span class="btn" style="background: var(--success); color: white; cursor: default;">
                <i class="fas fa-check"></i> Published
              </span>
            ` : `
              <span class="btn" style="background: var(--warning); color: white; cursor: default;">
                <i class="fas fa-clock"></i> Scheduled
              </span>
            `}
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Attach event listeners
      modal.querySelector('.modal-backdrop').onclick = () => this.closeModals();
      modal.querySelector('.modal-close').onclick = () => this.closeModals();
      modal.querySelector('#viewPostClose').onclick = () => this.closeModals();
      modal.querySelector('#viewPostDelete').onclick = () => {
        this.deletePost(post.id);
      };

      const publishBtn = modal.querySelector('#viewPostPublish');
      if (publishBtn) {
        publishBtn.onclick = () => {
          this.closeModals();
          this.publishPost(post.id);
        };
      }

    } catch (error) {
      console.error('Failed to load post:', error);
      this.showToast('Failed to load post', 'error');
    }
  }

  // Edit post - opens in post generator
  editPost(postId) {
    // Open the post in the generate view for editing
    window.open(`http://localhost:3002/generate.html?post=${postId}&business=${this.currentBusiness.id}`, '_blank');
  }

  // Publish post
  async publishPost(postId) {
    // Show publish modal with platform selection
    let modal = document.getElementById('publishPostModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'publishPostModal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }

    // First, get the post data
    try {
      const response = await fetch(`/api/posts/item/${postId}`);
      const data = await response.json();

      if (!data.success || !data.post) {
        this.showToast('Post not found', 'error');
        return;
      }

      const post = data.post;

      // Get connected social accounts
      const accountsResponse = await fetch(`http://localhost:3003/api/social/accounts/${this.currentBusiness.id}`);
      const accountsData = await accountsResponse.json();
      const accounts = accountsData.accounts || [];

      modal.innerHTML = `
        <div class="modal-backdrop" onclick="app.closeModals()"></div>
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h3><i class="fas fa-paper-plane" style="color: var(--primary); margin-right: 8px;"></i> Publish Post</h3>
            <button class="modal-close" onclick="app.closeModals()">&times;</button>
          </div>
          <div class="modal-body">
            ${post.image_url ? `
              <div style="margin-bottom: 16px; border-radius: 8px; overflow: hidden; max-height: 200px;">
                <img src="${post.image_url}" alt="Post" style="width: 100%; display: block; object-fit: cover;">
              </div>
            ` : ''}

            <div style="margin-bottom: 16px;">
              <label style="font-weight: 500; margin-bottom: 8px; display: block;">Select platforms to publish:</label>
              ${accounts.length > 0 ? `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  ${accounts.map(account => `
                    <label class="platform-option" style="display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--gray-50); border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.15s;">
                      <input type="checkbox" name="publish_platform" value="${account.id}" data-platform="${account.platform}" style="width: 18px; height: 18px;">
                      <i class="fab fa-${account.platform}" style="font-size: 20px; width: 24px; color: var(--text-primary);"></i>
                      <div>
                        <div style="font-weight: 500;">${account.account_name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${account.platform}</div>
                      </div>
                    </label>
                  `).join('')}
                </div>
              ` : `
                <div style="padding: 20px; text-align: center; background: var(--gray-50); border-radius: 8px;">
                  <i class="fas fa-link" style="font-size: 24px; color: var(--gray-400); margin-bottom: 8px;"></i>
                  <p style="color: var(--text-secondary); margin-bottom: 12px;">No social accounts connected</p>
                  <a href="http://localhost:3003?business=${this.currentBusiness.id}" target="_blank" class="btn btn-outline btn-sm">
                    <i class="fas fa-plus"></i> Connect Account
                  </a>
                </div>
              `}
            </div>

            ${accounts.length > 0 ? `
              <div style="margin-bottom: 16px;">
                <label style="font-weight: 500; margin-bottom: 8px; display: block;">Caption (optional):</label>
                <textarea id="publishCaption" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; resize: vertical;">${post.caption || ''}</textarea>
              </div>

              <div style="margin-bottom: 16px;">
                <label style="font-weight: 500; margin-bottom: 8px; display: block;">When to publish:</label>
                <div style="display: flex; gap: 8px;">
                  <label class="publish-time-option" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: var(--gray-50); border-radius: 8px; cursor: pointer; border: 2px solid var(--primary);">
                    <input type="radio" name="publish_time" value="now" checked style="display: none;">
                    <i class="fas fa-paper-plane"></i> Now
                  </label>
                  <label class="publish-time-option" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; background: var(--gray-50); border-radius: 8px; cursor: pointer; border: 2px solid transparent;">
                    <input type="radio" name="publish_time" value="scheduled" style="display: none;">
                    <i class="fas fa-clock"></i> Schedule
                  </label>
                </div>
              </div>

              <div id="scheduleTimeContainer" style="display: none; margin-bottom: 16px;">
                <label style="font-weight: 500; margin-bottom: 8px; display: block;">Schedule date and time:</label>
                <input type="datetime-local" id="scheduleDateTime" style="width: 100%; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px;">
              </div>
            ` : ''}
          </div>
          ${accounts.length > 0 ? `
            <div class="modal-footer">
              <button class="btn btn-outline" onclick="app.closeModals()">Cancel</button>
              <button class="btn btn-primary" id="publishActionBtn" onclick="app.executePublish('${post.id}')">
                <i class="fas fa-paper-plane"></i> Publish Now
              </button>
            </div>
          ` : `
            <div class="modal-footer">
              <button class="btn btn-outline" onclick="app.closeModals()">Close</button>
            </div>
          `}
        </div>
      `;

      modal.classList.add('show');

      // Add checkbox styling
      modal.querySelectorAll('.platform-option input').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          e.target.closest('.platform-option').style.borderColor = e.target.checked ? 'var(--primary)' : 'transparent';
          e.target.closest('.platform-option').style.background = e.target.checked ? 'rgba(59, 130, 246, 0.05)' : 'var(--gray-50)';
        });
      });

      // Add publish time option styling and toggle
      modal.querySelectorAll('.publish-time-option').forEach(option => {
        option.addEventListener('click', (e) => {
          // Update styling for all options
          modal.querySelectorAll('.publish-time-option').forEach(opt => {
            opt.style.borderColor = 'transparent';
            opt.style.background = 'var(--gray-50)';
          });
          // Highlight selected option
          option.style.borderColor = 'var(--primary)';
          option.style.background = 'rgba(59, 130, 246, 0.05)';

          // Toggle schedule time picker
          const isScheduled = option.querySelector('input').value === 'scheduled';
          const scheduleContainer = document.getElementById('scheduleTimeContainer');
          const publishBtn = document.getElementById('publishActionBtn');

          if (scheduleContainer) {
            scheduleContainer.style.display = isScheduled ? 'block' : 'none';
          }
          if (publishBtn) {
            publishBtn.innerHTML = isScheduled
              ? '<i class="fas fa-clock"></i> Schedule Post'
              : '<i class="fas fa-paper-plane"></i> Publish Now';
          }

          // Set default schedule time to 1 hour from now
          if (isScheduled) {
            const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
            const dateInput = document.getElementById('scheduleDateTime');
            if (dateInput && !dateInput.value) {
              dateInput.value = defaultTime.toISOString().slice(0, 16);
            }
          }
        });
      });

    } catch (error) {
      console.error('Failed to load publish data:', error);
      this.showToast('Failed to load publish options', 'error');
    }
  }

  async executePublish(postId) {
    const checkboxes = document.querySelectorAll('input[name="publish_platform"]:checked');

    if (checkboxes.length === 0) {
      this.showToast('Please select at least one platform', 'warning');
      return;
    }

    const caption = document.getElementById('publishCaption')?.value || '';

    // Check if scheduled or immediate
    const publishTimeOption = document.querySelector('input[name="publish_time"]:checked');
    const isScheduled = publishTimeOption?.value === 'scheduled';
    const scheduleDateTime = document.getElementById('scheduleDateTime')?.value;

    // Validate schedule time if scheduling
    if (isScheduled) {
      if (!scheduleDateTime) {
        this.showToast('Please select a schedule date and time', 'warning');
        return;
      }
      const scheduleTime = new Date(scheduleDateTime);
      if (scheduleTime <= new Date()) {
        this.showToast('Schedule time must be in the future', 'warning');
        return;
      }
    }

    // Extract platforms and account IDs in the format expected by the API
    const platforms = [];
    const social_account_ids = [];

    Array.from(checkboxes).forEach(cb => {
      platforms.push(cb.dataset.platform);
      social_account_ids.push(cb.value);
    });

    this.closeModals();
    this.showToast(isScheduled ? 'Scheduling post...' : 'Publishing post...', 'info');

    try {
      const endpoint = isScheduled
        ? 'http://localhost:3003/api/publish/schedule'
        : 'http://localhost:3003/api/publish/now';

      const body = {
        post_id: postId,
        platforms: platforms,
        social_account_ids: social_account_ids,
        caption: caption
      };

      if (isScheduled) {
        body.scheduled_at = new Date(scheduleDateTime).toISOString();
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.success) {
        if (isScheduled) {
          const scheduledTime = new Date(scheduleDateTime).toLocaleString();
          this.showToast(`Post scheduled for ${scheduledTime}`, 'success');
        } else {
          this.showToast('Post published successfully!', 'success');
        }
        this.renderPosts(); // Refresh posts list
      } else {
        this.showToast(data.error || 'Failed to process post', 'error');
      }
    } catch (error) {
      console.error('Publish/Schedule failed:', error);
      this.showToast('Failed to process post', 'error');
    }
  }

  async deletePost(postId) {
    const self = this;
    // Show custom confirmation modal
    this.showConfirmModal(
      'Delete Post',
      'Are you sure you want to delete this post? This action cannot be undone.',
      'Delete',
      'danger',
      async () => {
        try {
          console.log('Deleting post:', postId);
          const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE'
          });
          const data = await response.json();
          console.log('Delete response:', data);

          if (data.success) {
            self.showToast('Post deleted successfully', 'success');
            self.closeModals();
            // Refresh the current view - could be Dashboard or Posts page
            if (self.currentPage === 'dashboard') {
              self.renderDashboard();
            } else if (self.currentPage === 'posts') {
              self.renderPosts();
            } else {
              // For any other page, refresh both to be safe
              self.renderPage(self.currentPage);
            }
          } else {
            self.showToast(data.error || 'Failed to delete post', 'error');
            self.closeModals();
          }
        } catch (error) {
          console.error('Delete failed:', error);
          self.showToast('Failed to delete post', 'error');
          self.closeModals();
        }
      }
    );
  }

  // Custom confirmation modal
  showConfirmModal(title, message, confirmText, confirmType, onConfirm) {
    // Remove existing modal
    const existingModal = document.getElementById('confirmModal');
    if (existingModal) existingModal.remove();

    // Create fresh modal
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.className = 'modal show';
    document.body.appendChild(modal);

    const btnClass = confirmType === 'danger' ? 'btn-danger' : 'btn-primary';
    const iconClass = confirmType === 'danger' ? 'fa-exclamation-triangle' : 'fa-question-circle';
    const iconColor = confirmType === 'danger' ? 'var(--danger)' : 'var(--primary)';

    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3><i class="fas ${iconClass}" style="color: ${iconColor}; margin-right: 8px;"></i>${title}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <p style="color: var(--text-secondary);">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="confirmCancelBtn">Cancel</button>
          <button class="btn ${btnClass}" id="confirmModalBtn">
            <i class="fas fa-trash"></i> ${confirmText}
          </button>
        </div>
      </div>
    `;

    // Store reference to this
    const self = this;

    // Attach event listeners properly
    modal.querySelector('.modal-backdrop').onclick = () => self.closeModals();
    modal.querySelector('.modal-close').onclick = () => self.closeModals();
    modal.querySelector('#confirmCancelBtn').onclick = () => self.closeModals();

    // Attach confirm action with proper context
    modal.querySelector('#confirmModalBtn').onclick = async () => {
      // Disable button to prevent double-click
      const btn = modal.querySelector('#confirmModalBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

      try {
        await onConfirm();
      } catch (error) {
        console.error('Confirm action failed:', error);
        self.showToast('Operation failed', 'error');
        self.closeModals();
      }
    };
  }

  // Templates
  async renderTemplates() {
    const content = document.getElementById('contentArea');

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Templates</h1>
        <div class="page-actions">
          <a href="http://localhost:3002/templates?business=${this.currentBusiness.id}" target="_blank" class="btn btn-outline">
            <i class="fas fa-external-link-alt"></i> Manage All
          </a>
          <a href="http://localhost:3002/?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary">
            <i class="fas fa-plus"></i> Create Template
          </a>
        </div>
      </div>

      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading templates...</p>
      </div>
    `;

    try {
      const response = await fetch(`http://localhost:3002/api/templates/${this.currentBusiness.id}`);
      const data = await response.json();
      const templates = data.templates || [];

      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Templates</h1>
          <div class="page-actions">
            <a href="http://localhost:3002/templates?business=${this.currentBusiness.id}" target="_blank" class="btn btn-outline">
              <i class="fas fa-external-link-alt"></i> Manage All
            </a>
            <a href="http://localhost:3002/?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary">
              <i class="fas fa-plus"></i> Create Template
            </a>
          </div>
        </div>

        ${templates.length > 0 ? `
          <div class="templates-grid">
            ${templates.map(template => {
              const placeholderCount = template.placeholders ? Object.keys(template.placeholders).length : 0;
              return `
              <div class="template-card" data-id="${template.id}" onclick="app.openTemplateEditor('${template.id}')" style="cursor: pointer;">
                <div class="template-preview">
                  ${template.thumbnail
                    ? `<img src="${template.thumbnail}" alt="${template.name}">`
                    : `<canvas class="template-canvas" data-template-id="${template.id}" width="220" height="220"></canvas>`
                  }
                  ${placeholderCount > 0 ? `
                    <div style="position: absolute; bottom: 8px; left: 8px;">
                      <span style="background: var(--primary); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                        <i class="fas fa-link"></i> ${placeholderCount} placeholder${placeholderCount > 1 ? 's' : ''}
                      </span>
                    </div>
                  ` : ''}
                </div>
                <div class="template-info">
                  <div class="template-name">${template.name}</div>
                  <div class="template-platform">
                    <i class="fab fa-${template.platform}"></i> ${template.platform} - ${template.width}x${template.height}
                  </div>
                </div>
                <div style="display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border-color); background: var(--gray-50);">
                  <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="event.stopPropagation(); app.openTemplateEditor('${template.id}')">
                    <i class="fas fa-pen"></i> Edit
                  </button>
                  ${placeholderCount > 0 ? `
                    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); app.generateFromTemplate('${template.id}')">
                      <i class="fas fa-magic"></i>
                    </button>
                  ` : ''}
                  <button class="btn btn-outline btn-sm" style="color: var(--danger);" onclick="event.stopPropagation(); app.deleteTemplate('${template.id}')">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            `}).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <i class="fas fa-layer-group"></i>
            <h3>No templates yet</h3>
            <p>Create reusable templates for your social media posts</p>
            <a href="http://localhost:3002/?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary">
              <i class="fas fa-plus"></i> Create Template
            </a>
          </div>
        `}
      `;

      // Store templates and render canvas previews
      this.templates = templates;
      setTimeout(() => this.renderCanvasPreviews(), 50);

    } catch (error) {
      console.error('Failed to load templates:', error);
      content.innerHTML = `
        <div class="page-header">
          <h1 class="page-title">Templates</h1>
        </div>
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <h3>Failed to load templates</h3>
          <p>Make sure the Post Generator service is running on port 3002</p>
        </div>
      `;
    }
  }

  // Render template previews on canvases
  async renderCanvasPreviews() {
    const canvases = document.querySelectorAll('.template-canvas');

    for (const canvas of canvases) {
      canvas.classList.add('loading');
      try {
        const templateId = canvas.dataset.templateId;
        const templateData = this.templates.find(t => t.id === templateId);
        if (templateData) {
          await this.renderTemplatePreview(canvas, templateData);
        }
      } catch (err) {
        console.error('Error rendering preview:', err);
      } finally {
        canvas.classList.remove('loading');
      }
    }
  }

  // Render a single template preview on canvas
  async renderTemplatePreview(canvas, template) {
    const ctx = canvas.getContext('2d');

    // Get actual canvas size from DOM (may be scaled by CSS)
    const rect = canvas.getBoundingClientRect();
    const canvasSize = Math.max(rect.width, rect.height, 220);

    // Set canvas resolution to match display size for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    ctx.scale(dpr, dpr);

    // Calculate scale to fit template in canvas
    const scaleX = canvasSize / (template.width || 1080);
    const scaleY = canvasSize / (template.height || 1080);
    const scale = Math.min(scaleX, scaleY);

    // Center the preview
    const offsetX = (canvasSize - template.width * scale) / 2;
    const offsetY = (canvasSize - template.height * scale) / 2;

    // Clear canvas with neutral background
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw background
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, template.width * scale, template.height * scale);
    ctx.clip();

    const bgType = template.background_type || 'color';
    let bgValue = template.background_value || '#ffffff';

    // Parse background_value if it's a JSON string
    if (typeof bgValue === 'string' && bgValue.startsWith('{')) {
      try {
        const parsed = JSON.parse(bgValue);
        bgValue = parsed.url || parsed.value || bgValue;
      } catch (e) {
        // Keep original value if parsing fails
      }
    }

    if (bgType === 'color') {
      ctx.fillStyle = bgValue;
      ctx.fillRect(offsetX, offsetY, template.width * scale, template.height * scale);
    } else if (bgType === 'gradient') {
      ctx.fillStyle = '#667eea';
      ctx.fillRect(offsetX, offsetY, template.width * scale, template.height * scale);
    } else if (bgType === 'image' && bgValue) {
      try {
        const img = await this.loadPreviewImage(bgValue);
        ctx.drawImage(img, offsetX, offsetY, template.width * scale, template.height * scale);
      } catch (e) {
        this.drawGradientPlaceholder(ctx, offsetX, offsetY, template.width * scale, template.height * scale);
      }
    } else {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(offsetX, offsetY, template.width * scale, template.height * scale);
    }

    ctx.restore();

    // Draw elements (sorted by zIndex if available)
    const elements = (template.elements || []).slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const element of elements) {
      try {
        if (element.visible !== false) {
          await this.renderPreviewElement(ctx, element, scale, offsetX, offsetY);
        }
      } catch (e) {
        console.warn('Error rendering element:', element.id, e);
      }
    }
  }

  // Render a single element on the preview canvas
  async renderPreviewElement(ctx, element, scale, offsetX, offsetY) {
    const x = element.x * scale + offsetX;
    const y = element.y * scale + offsetY;
    const width = (element.width || 100) * scale;
    const height = (element.height || 100) * scale;

    ctx.save();
    // Handle opacity (might be 0-100 or 0-1)
    let opacity = element.opacity !== undefined ? element.opacity : 1;
    if (opacity > 1) opacity = opacity / 100;
    ctx.globalAlpha = opacity;

    if (element.rotation) {
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.translate(centerX, centerY);
      ctx.rotate((element.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    if (element.type === 'text') {
      const fontSize = Math.max(8, (element.fontSize || 24) * scale);
      const fontFamily = element.fontFamily || 'Inter';
      const fontWeight = element.fontWeight || 400;

      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
      ctx.fillStyle = element.color || '#000000';
      ctx.textAlign = element.textAlign || 'left';
      ctx.textBaseline = 'top';

      const text = element.text || '';
      const drawX = element.textAlign === 'center' ? x + width / 2 :
                   element.textAlign === 'right' ? x + width : x;

      ctx.fillText(text, drawX, y);

    } else if (element.type === 'image' && element.src) {
      try {
        const img = await this.loadPreviewImage(element.src);
        ctx.drawImage(img, x, y, width, height);
      } catch (e) {
        ctx.fillStyle = '#e0e0e0';
        ctx.fillRect(x, y, width, height);
      }
    } else if (element.type === 'shape') {
      ctx.fillStyle = element.fill || '#cccccc';
      if (element.shapeType === 'circle' || element.shapeType === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, width, height);
      }
    }

    ctx.restore();
  }

  // Load image for preview (with caching)
  loadPreviewImage(src) {
    if (!src) return Promise.reject(new Error('No source'));

    if (!this.imageCache) this.imageCache = new Map();

    if (this.imageCache.has(src)) {
      return Promise.resolve(this.imageCache.get(src));
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = (e) => {
        console.warn('Failed to load image:', src);
        reject(e);
      };
      setTimeout(() => reject(new Error('Image load timeout')), 5000);
      img.src = src;
    });
  }

  // Draw a gradient placeholder when image fails
  drawGradientPlaceholder(ctx, x, y, width, height, color1 = '#667eea', color2 = '#764ba2') {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
  }

  openTemplateEditor(templateId) {
    window.open(`http://localhost:3002/?id=${templateId}&business=${this.currentBusiness.id}`, '_blank');
  }

  generateFromTemplate(templateId) {
    window.open(`http://localhost:3002/generate.html?template=${templateId}&business=${this.currentBusiness.id}`, '_blank');
  }

  // AI Template Generation
  async generateAITemplate() {
    const prompt = document.getElementById('aiPromptInput')?.value.trim();

    if (!prompt) {
      this.showToast('Please describe what template you want', 'error');
      return;
    }

    if (!this.currentBusiness) {
      this.showToast('Please select a business first', 'error');
      return;
    }

    const headline = document.getElementById('aiHeadlineInput')?.value.trim() || '';
    const subtext = document.getElementById('aiSubtextInput')?.value.trim() || '';
    const platform = document.getElementById('aiPlatformSelect')?.value || 'instagram';
    const style = document.getElementById('aiStyleSelect')?.value || 'vibrant';

    const sizes = {
      instagram: { width: 1080, height: 1080 },
      instagram_story: { width: 1080, height: 1920 },
      facebook: { width: 1200, height: 630 },
      twitter: { width: 1200, height: 675 },
      linkedin: { width: 1200, height: 627 }
    };
    const { width, height } = sizes[platform];

    // Get business info for template
    const business = this.currentBusiness;
    // Convert relative logo path to full URL for cross-service requests
    let logoFullUrl = '';
    if (business.logo) {
      logoFullUrl = business.logo.startsWith('http') ? business.logo : `http://localhost:3004${business.logo}`;
    }
    const businessInfo = {
      name: business.name || '',
      logo: logoFullUrl,
      phone: business.phone || '',
      email: business.email || '',
      website: business.website || '',
      address: business.address || '',
      social_links: business.social_links || {},
      brand_colors: business.brand_colors || {}
    };

    // Show generating modal
    this.showGeneratingModal();

    try {
      // Call the background engine to generate template
      const response = await fetch('http://localhost:3001/api/backgrounds/generate-complete-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          headline,
          subtext,
          platform,
          style,
          width,
          height,
          generateBackground: true,
          businessInfo
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'AI generation failed');
      }

      // Determine background type and value
      let bgType = 'color';
      let bgValue = '#1a1a2e';

      if (data.background) {
        if (data.background.type === 'image' && data.background.url) {
          bgType = 'image';
          bgValue = JSON.stringify({ url: `http://localhost:3001${data.background.url}` });
        } else if (data.background.type === 'gradient' && data.background.gradient) {
          bgType = 'gradient';
          bgValue = JSON.stringify(data.background.gradient);
        }
      }

      // Save the template
      const saveResponse = await fetch('http://localhost:3002/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: this.currentBusiness.id,
          name: data.templateName || 'AI Generated Template',
          platform,
          width,
          height,
          elements: data.elements || [],
          background_type: bgType,
          background_value: bgValue,
          placeholders: data.placeholders || {}
        })
      });

      const saveData = await saveResponse.json();

      if (!saveData.success) {
        throw new Error('Failed to save template');
      }

      this.closeGeneratingModal();
      this.showToast('Template generated successfully!', 'success');

      // Open in editor
      window.open(`http://localhost:3002/?id=${saveData.template.id}&business=${this.currentBusiness.id}`, '_blank');

    } catch (error) {
      console.error('AI generation error:', error);
      this.closeGeneratingModal();
      this.showToast(error.message || 'Failed to generate template', 'error');
    }
  }

  showGeneratingModal() {
    let modal = document.getElementById('aiGeneratingModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'aiGeneratingModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 400px; text-align: center; padding: 40px;">
          <div style="width: 80px; height: 80px; margin: 0 auto 24px; position: relative;">
            <div style="position: absolute; inset: 0; border: 4px solid var(--gray-200); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <i class="fas fa-wand-magic-sparkles" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 24px; color: var(--primary);"></i>
          </div>
          <h3 style="margin-bottom: 12px;">Generating Template</h3>
          <p style="color: var(--text-secondary);">AI is creating your template with background and elements...</p>
        </div>
      `;
      document.body.appendChild(modal);

      // Add keyframes for spin animation if not already present
      if (!document.getElementById('spinKeyframes')) {
        const style = document.createElement('style');
        style.id = 'spinKeyframes';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
    }
    modal.classList.add('show');
  }

  closeGeneratingModal() {
    const modal = document.getElementById('aiGeneratingModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  // Create Post - Show template selection
  async openCreatePostModal() {
    if (!this.currentBusiness) {
      this.showToast('Please select a business first', 'warning');
      return;
    }

    // Create modal if doesn't exist
    let modal = document.getElementById('createPostModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'createPostModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop" onclick="app.closeModals()"></div>
        <div class="modal-content" style="max-width: 700px;">
          <div class="modal-header">
            <h3>Create Post</h3>
            <button class="modal-close" onclick="app.closeModals()">&times;</button>
          </div>
          <div class="modal-body" id="createPostModalBody">
            <div class="loading-state">
              <i class="fas fa-spinner fa-spin"></i>
              <p>Loading templates...</p>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    modal.classList.add('show');

    // Load templates
    try {
      const response = await fetch(`http://localhost:3002/api/templates/${this.currentBusiness.id}`);
      const data = await response.json();
      const templates = data.templates || [];

      const body = document.getElementById('createPostModalBody');

      if (templates.length === 0) {
        body.innerHTML = `
          <div class="empty-state" style="padding: 40px;">
            <i class="fas fa-layer-group" style="font-size: 48px; color: var(--gray-300); margin-bottom: 16px;"></i>
            <h3>No Templates Yet</h3>
            <p style="margin-bottom: 20px;">Create a template first to start generating posts</p>
            <a href="http://localhost:3002/?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary" onclick="app.closeModals()">
              <i class="fas fa-plus"></i> Create Template
            </a>
          </div>
        `;
        return;
      }

      body.innerHTML = `
        <p style="margin-bottom: 16px; color: var(--text-secondary);">Select a template to create your post:</p>
        <div class="template-select-grid">
          ${templates.map(template => {
            const placeholderCount = template.placeholders ? Object.keys(template.placeholders).length : 0;
            return `
              <div class="template-select-card" onclick="app.selectTemplateForPost('${template.id}')">
                <div class="template-select-preview">
                  ${template.thumbnail
                    ? `<img src="${template.thumbnail}" alt="${template.name}">`
                    : `<i class="fas fa-layer-group"></i>`
                  }
                </div>
                <div class="template-select-info">
                  <div class="template-select-name">${template.name}</div>
                  <div class="template-select-meta">
                    <span><i class="fab fa-${template.platform}"></i> ${template.platform}</span>
                    ${placeholderCount > 0 ? `<span><i class="fas fa-link"></i> ${placeholderCount} fields</span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-color); text-align: center;">
          <a href="http://localhost:3002/?business=${this.currentBusiness.id}" target="_blank" class="btn btn-outline" onclick="app.closeModals()">
            <i class="fas fa-plus"></i> Create New Template
          </a>
        </div>
      `;
    } catch (error) {
      console.error('Failed to load templates:', error);
      document.getElementById('createPostModalBody').innerHTML = `
        <div class="empty-state" style="padding: 40px;">
          <i class="fas fa-exclamation-circle" style="font-size: 48px; color: var(--danger); margin-bottom: 16px;"></i>
          <h3>Failed to Load Templates</h3>
          <p>Make sure the Post Generator service is running</p>
        </div>
      `;
    }
  }

  selectTemplateForPost(templateId) {
    this.closeModals();
    window.open(`http://localhost:3002/generate.html?template=${templateId}&business=${this.currentBusiness.id}`, '_blank');
  }

  async deleteTemplate(templateId) {
    const self = this;
    this.showConfirmModal(
      'Delete Template',
      'Are you sure you want to delete this template? This action cannot be undone.',
      'Delete',
      'danger',
      async () => {
        try {
          const response = await fetch(`http://localhost:3002/api/templates/${templateId}`, {
            method: 'DELETE'
          });
          const data = await response.json();

          if (data.success) {
            self.showToast('Template deleted successfully', 'success');
            self.closeModals();
            self.renderTemplates();
          } else {
            self.showToast(data.error || 'Failed to delete template', 'error');
            self.closeModals();
          }
        } catch (error) {
          console.error('Delete failed:', error);
          self.showToast('Failed to delete template', 'error');
          self.closeModals();
        }
      }
    );
  }

  // Schedule
  renderSchedule() {
    const content = document.getElementById('contentArea');

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Schedule</h1>
        <div class="page-actions">
          <a href="http://localhost:3003?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary">
            <i class="fas fa-external-link-alt"></i> Open Scheduler
          </a>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="empty-state" style="padding: 60px 20px;">
            <i class="fas fa-calendar-alt" style="font-size: 64px; color: var(--gray-300); margin-bottom: 20px;"></i>
            <h3 style="margin-bottom: 8px;">Schedule Manager</h3>
            <p style="margin-bottom: 24px; color: var(--text-secondary);">Manage your scheduled posts in the Auto Poster service</p>
            <a href="http://localhost:3003?business=${this.currentBusiness.id}" target="_blank" class="btn btn-primary">
              <i class="fas fa-external-link-alt"></i> Open Auto Poster
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // Assets
  async renderAssets() {
    const content = document.getElementById('contentArea');

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Assets</h1>
        <div class="page-actions">
          <button class="btn btn-primary" onclick="app.uploadAsset()">
            <i class="fas fa-upload" style="font-size: 14px;"></i> Upload Asset
          </button>
        </div>
      </div>

      <div class="loading-state">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading assets...</p>
      </div>
    `;

    try {
      const response = await fetch(`/api/assets/${this.currentBusiness.id}`);
      const data = await response.json();
      const assets = data.assets || [];

      content.innerHTML = `
        <style>
          .assets-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 20px;
            padding: 20px 0;
          }
          .asset-card {
            background: var(--card-bg);
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border);
            transition: transform 0.2s, box-shadow 0.2s;
            position: relative;
          }
          .asset-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          }
          .asset-thumbnail {
            width: 100%;
            height: 160px;
            overflow: hidden;
            background: var(--bg);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .asset-thumbnail img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.3s;
          }
          .asset-card:hover .asset-thumbnail img {
            transform: scale(1.05);
          }
          .asset-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            opacity: 0;
            transition: opacity 0.2s;
          }
          .asset-card:hover .asset-overlay {
            opacity: 1;
          }
          .asset-overlay button {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            transition: transform 0.2s;
          }
          .asset-overlay button:hover {
            transform: scale(1.1);
          }
          .asset-overlay .btn-view {
            background: var(--primary);
            color: white;
          }
          .asset-overlay .btn-delete {
            background: var(--danger);
            color: white;
          }
          .asset-info {
            padding: 12px;
          }
          .asset-name {
            font-weight: 600;
            font-size: 14px;
            color: var(--text);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 4px;
          }
          .asset-meta {
            font-size: 12px;
            color: var(--text-secondary);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .asset-type {
            background: var(--primary);
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            text-transform: uppercase;
          }
          /* Asset Preview Modal */
          .asset-preview-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .asset-preview-backdrop {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.85);
          }
          .asset-preview-content {
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
          }
          .asset-preview-content img {
            max-width: 100%;
            max-height: 85vh;
            border-radius: 8px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          }
          .asset-preview-close {
            position: absolute;
            top: -40px;
            right: 0;
            background: white;
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .asset-preview-name {
            text-align: center;
            color: white;
            margin-top: 12px;
            font-size: 14px;
          }
        </style>

        <div class="page-header">
          <h1 class="page-title">Assets</h1>
          <div class="page-actions">
            <input type="file" id="assetUpload" hidden accept="image/*" multiple onchange="app.handleAssetUpload(event)">
            <button class="btn btn-primary" onclick="document.getElementById('assetUpload').click()">
              <i class="fas fa-upload" style="font-size: 14px;"></i> Upload Asset
            </button>
          </div>
        </div>

        ${assets.length > 0 ? `
          <div class="assets-grid">
            ${assets.map(asset => `
              <div class="asset-card" data-id="${asset.id}">
                <div class="asset-thumbnail">
                  <img src="${asset.file_url}" alt="${asset.name}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23333%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%23666%22 font-size=%2214%22>No Preview</text></svg>'">
                  <div class="asset-overlay">
                    <button class="btn-view" onclick="app.viewAsset('${asset.file_url}', '${asset.name.replace(/'/g, "\\'")}')" title="View">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-delete" onclick="app.deleteAsset('${asset.id}')" title="Delete">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
                <div class="asset-info">
                  <div class="asset-name" title="${asset.name}">${asset.name}</div>
                  <div class="asset-meta">
                    <span class="asset-type">${asset.type || 'image'}</span>
                    <span>${this.formatDate(asset.created_at)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="empty-state">
            <i class="fas fa-folder-open"></i>
            <h3>No assets yet</h3>
            <p>Upload images, logos, and other assets for your posts</p>
            <input type="file" id="assetUploadEmpty" hidden accept="image/*" multiple onchange="app.handleAssetUpload(event)">
            <button class="btn btn-primary" onclick="document.getElementById('assetUploadEmpty').click()">
              <i class="fas fa-upload" style="font-size: 14px;"></i> Upload Asset
            </button>
          </div>
        `}
      `;
    } catch (error) {
      console.error('Failed to load assets:', error);
    }
  }

  viewAsset(url, name) {
    const modal = document.createElement('div');
    modal.className = 'asset-preview-modal';
    modal.innerHTML = `
      <div class="asset-preview-backdrop" onclick="this.parentElement.remove()"></div>
      <div class="asset-preview-content">
        <button class="asset-preview-close" onclick="this.closest('.asset-preview-modal').remove()">
          <i class="fas fa-times"></i>
        </button>
        <img src="${url}" alt="${name}">
        <div class="asset-preview-name">${name}</div>
      </div>
    `;
    document.body.appendChild(modal);

    // Close on escape key
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
  }

  async deleteAsset(assetId) {
    this.showConfirmModal(
      'Delete Asset',
      'Are you sure you want to delete this asset? This action cannot be undone.',
      'Delete',
      'danger',
      async () => {
        try {
          const response = await fetch(`/api/assets/${assetId}`, {
            method: 'DELETE'
          });
          const data = await response.json();

          if (data.success) {
            this.showToast('Asset deleted successfully', 'success');
            this.closeModals();
            this.renderAssets();
          } else {
            this.showToast(data.error || 'Failed to delete asset', 'error');
            this.closeModals();
          }
        } catch (error) {
          console.error('Delete failed:', error);
          this.showToast('Failed to delete asset', 'error');
          this.closeModals();
        }
      }
    );
  }

  async handleAssetUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('business_id', this.currentBusiness.id);
    formData.append('name', file.name);
    formData.append('type', 'image');

    try {
      const response = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        this.showToast('Asset uploaded successfully', 'success');
        this.renderAssets();
      } else {
        this.showToast(data.error || 'Failed to upload asset', 'error');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      this.showToast('Failed to upload asset', 'error');
    }
  }

  // Settings
  renderSettings() {
    const content = document.getElementById('contentArea');
    const business = this.currentBusiness;

    content.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Business Settings</h1>
        <div class="page-actions">
          <button class="btn btn-outline" onclick="app.editBusiness('${business.id}')">
            <i class="fas fa-edit"></i> Edit Business
          </button>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="settings-section">
            <h3>Business Information</h3>
            <div class="form-group">
              <label>Business Name</label>
              <p>${business.name}</p>
            </div>
            ${business.description ? `
              <div class="form-group">
                <label>Description</label>
                <p>${business.description}</p>
              </div>
            ` : ''}
            ${business.industry ? `
              <div class="form-group">
                <label>Industry</label>
                <p>${business.industry}</p>
              </div>
            ` : ''}
          </div>

          <div class="settings-section">
            <h3>Brand Colors</h3>
            <div class="color-inputs">
              <div class="color-input">
                <label>Primary</label>
                <div style="width: 48px; height: 48px; background: ${business.brand_colors.primary || '#3B82F6'}; border-radius: 8px;"></div>
                <span class="color-value">${business.brand_colors.primary || '#3B82F6'}</span>
              </div>
              <div class="color-input">
                <label>Secondary</label>
                <div style="width: 48px; height: 48px; background: ${business.brand_colors.secondary || '#1E40AF'}; border-radius: 8px;"></div>
                <span class="color-value">${business.brand_colors.secondary || '#1E40AF'}</span>
              </div>
              <div class="color-input">
                <label>Accent</label>
                <div style="width: 48px; height: 48px; background: ${business.brand_colors.accent || '#F59E0B'}; border-radius: 8px;"></div>
                <span class="color-value">${business.brand_colors.accent || '#F59E0B'}</span>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h3>Contact Information</h3>
            <div class="form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div class="form-group">
                <label>Email</label>
                <p>${business.email || 'Not set'}</p>
              </div>
              <div class="form-group">
                <label>Phone</label>
                <p>${business.phone || 'Not set'}</p>
              </div>
            </div>
            <div class="form-group">
              <label>Website</label>
              <p>${business.website ? `<a href="${business.website}" target="_blank">${business.website}</a>` : 'Not set'}</p>
            </div>
            <div class="form-group">
              <label>Address</label>
              <p>${business.address || 'Not set'}</p>
            </div>
          </div>

          <div class="settings-section">
            <h3>Social Media Links</h3>
            <div style="display: flex; gap: 16px; flex-wrap: wrap;">
              ${Object.entries(business.social_links || {}).filter(([k, v]) => v).map(([platform, url]) => `
                <a href="${url}" target="_blank" class="btn btn-outline btn-sm">
                  <i class="fab fa-${platform}"></i> ${platform}
                </a>
              `).join('') || '<p style="color: var(--text-secondary);">No social links configured</p>'}
            </div>
          </div>

          <div class="settings-section">
            <h3 style="color: var(--danger);">Danger Zone</h3>
            <button class="btn btn-danger" onclick="app.deleteBusiness('${business.id}')">
              <i class="fas fa-trash"></i> Delete Business
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // Business Modal
  openBusinessModal(business = null) {
    const modal = document.getElementById('businessModal');
    const form = document.getElementById('businessForm');
    const title = document.getElementById('businessModalTitle');

    // Reset form
    form.reset();
    document.getElementById('businessId').value = '';
    document.getElementById('logoPreview').innerHTML = '<i class="fas fa-building"></i>';

    // Reset tabs
    this.switchFormTab('basic');

    if (business) {
      title.textContent = 'Edit Business';
      document.getElementById('businessId').value = business.id;
      document.getElementById('businessName').value = business.name;
      document.getElementById('businessDescription').value = business.description || '';
      document.getElementById('businessIndustry').value = business.industry || '';
      document.getElementById('businessEmail').value = business.email || '';
      document.getElementById('businessPhone').value = business.phone || '';
      document.getElementById('businessWebsite').value = business.website || '';
      document.getElementById('businessAddress').value = business.address || '';

      // Brand colors
      if (business.brand_colors) {
        document.getElementById('colorPrimary').value = business.brand_colors.primary || '#3B82F6';
        document.getElementById('colorSecondary').value = business.brand_colors.secondary || '#1E40AF';
        document.getElementById('colorAccent').value = business.brand_colors.accent || '#F59E0B';

        document.querySelectorAll('.color-input').forEach(input => {
          const colorInput = input.querySelector('input[type="color"]');
          input.querySelector('.color-value').textContent = colorInput.value.toUpperCase();
        });
      }

      // Fonts
      if (business.fonts) {
        document.getElementById('fontHeading').value = business.fonts.heading || 'Inter';
        document.getElementById('fontBody').value = business.fonts.body || 'Inter';
      }

      // Social links
      if (business.social_links) {
        document.getElementById('socialInstagram').value = business.social_links.instagram || '';
        document.getElementById('socialFacebook').value = business.social_links.facebook || '';
        document.getElementById('socialTwitter').value = business.social_links.twitter || '';
        document.getElementById('socialLinkedin').value = business.social_links.linkedin || '';
        document.getElementById('socialWhatsapp').value = business.social_links.whatsapp || '';
      }

      // Logo
      if (business.logo) {
        document.getElementById('logoPreview').innerHTML = `<img src="${business.logo}" alt="Logo">`;
      }
    } else {
      title.textContent = 'Create New Business';
    }

    modal.classList.add('show');
  }

  editBusiness(businessId) {
    const business = this.businesses.find(b => b.id === businessId);
    if (business) {
      this.openBusinessModal(business);
    }
  }

  async saveBusiness() {
    const businessId = document.getElementById('businessId').value;
    const formData = new FormData();

    formData.append('name', document.getElementById('businessName').value);
    formData.append('description', document.getElementById('businessDescription').value);
    formData.append('industry', document.getElementById('businessIndustry').value);
    formData.append('email', document.getElementById('businessEmail').value);
    formData.append('phone', document.getElementById('businessPhone').value);
    formData.append('website', document.getElementById('businessWebsite').value);
    formData.append('address', document.getElementById('businessAddress').value);

    // Brand colors
    formData.append('brand_colors', JSON.stringify({
      primary: document.getElementById('colorPrimary').value,
      secondary: document.getElementById('colorSecondary').value,
      accent: document.getElementById('colorAccent').value
    }));

    // Fonts
    formData.append('fonts', JSON.stringify({
      heading: document.getElementById('fontHeading').value,
      body: document.getElementById('fontBody').value
    }));

    // Social links
    formData.append('social_links', JSON.stringify({
      instagram: document.getElementById('socialInstagram').value,
      facebook: document.getElementById('socialFacebook').value,
      twitter: document.getElementById('socialTwitter').value,
      linkedin: document.getElementById('socialLinkedin').value,
      whatsapp: document.getElementById('socialWhatsapp').value
    }));

    // Logo
    const logoInput = document.getElementById('businessLogo');
    if (logoInput.files[0]) {
      formData.append('logo', logoInput.files[0]);
    }

    try {
      const url = businessId ? `/api/businesses/${businessId}` : '/api/businesses';
      const method = businessId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        this.showToast(businessId ? 'Business updated successfully' : 'Business created successfully', 'success');
        this.closeModals();
        await this.loadBusinesses();
        this.renderBusinessTabs();

        if (data.business) {
          this.selectBusiness(data.business.id);
        }
      } else {
        this.showToast(data.error || 'Failed to save business', 'error');
      }
    } catch (error) {
      console.error('Save failed:', error);
      this.showToast('Failed to save business', 'error');
    }
  }

  async deleteBusiness(businessId) {
    const self = this;
    this.showConfirmModal(
      'Delete Business',
      'Are you sure you want to delete this business? All associated posts, templates, and data will be permanently deleted. This action cannot be undone.',
      'Delete Business',
      'danger',
      async () => {
        try {
          const response = await fetch(`/api/businesses/${businessId}`, {
            method: 'DELETE'
          });

          const data = await response.json();

          if (data.success) {
            self.showToast('Business deleted successfully', 'success');
            self.closeModals();
            await self.loadBusinesses();
            self.renderBusinessTabs();

            if (self.businesses.length > 0) {
              self.selectBusiness(self.businesses[0].id);
            } else {
              self.currentBusiness = null;
              self.renderEmptyState();
            }
          } else {
            self.showToast(data.error || 'Failed to delete business', 'error');
            self.closeModals();
          }
        } catch (error) {
          console.error('Delete failed:', error);
          self.showToast('Failed to delete business', 'error');
          self.closeModals();
        }
      }
    );
  }

  switchFormTab(tab) {
    document.querySelectorAll('.form-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    document.querySelectorAll('.form-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${tab}`);
    });
  }

  previewLogo(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('logoPreview').innerHTML = `<img src="${e.target.result}" alt="Logo">`;
    };
    reader.readAsDataURL(file);
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('show');
    });
  }

  // Helpers
  renderEmptyState() {
    const content = document.getElementById('contentArea');
    content.innerHTML = this.getEmptyStateHTML();
  }

  getEmptyStateHTML() {
    return `
      <div class="empty-state" style="min-height: 60vh;">
        <i class="fas fa-building"></i>
        <h3>No Business Selected</h3>
        <p>Create a business to get started with managing your social media</p>
        <button class="btn btn-primary" onclick="app.openBusinessModal()">
          <i class="fas fa-plus"></i> Create Business
        </button>
      </div>
    `;
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
}

// Initialize app
const app = new App();
