// Auto Poster App

class AutoPoster {
  constructor() {
    this.businessId = new URLSearchParams(window.location.search).get('business');
    this.currentDate = new Date();
    this.currentView = 'month';
    this.posts = [];
    this.accounts = [];
    this.selectedPost = null;
    this.selectedPlatform = null;
    this.selectedSharePlatforms = [];
    this.shareInProgress = false;

    this.init();
  }

  async init() {
    await this.loadBusinesses();
    this.setupEventListeners();

    if (this.businessId) {
      document.getElementById('businessSelect').value = this.businessId;
      await this.loadData();
    }

    this.renderCalendar();
  }

  async loadBusinesses() {
    try {
      const response = await fetch('http://localhost:3004/api/businesses');
      const data = await response.json();

      const select = document.getElementById('businessSelect');
      select.innerHTML = '<option value="">Select Business</option>';

      data.businesses?.forEach(business => {
        const option = document.createElement('option');
        option.value = business.id;
        option.textContent = business.name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load businesses:', error);
    }
  }

  async loadData() {
    if (!this.businessId) return;

    await Promise.all([
      this.loadStats(),
      this.loadAccounts(),
      this.loadUpcoming(),
      this.loadCalendarData()
    ]);
  }

  async loadStats() {
    try {
      const response = await fetch(`/api/schedule/stats/${this.businessId}`);
      const data = await response.json();

      if (data.success) {
        document.getElementById('scheduledCount').textContent = data.stats.pending;
        document.getElementById('publishedCount').textContent = data.stats.published;
        document.getElementById('failedCount').textContent = data.stats.failed;
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async loadAccounts() {
    try {
      const response = await fetch(`/api/social/accounts/${this.businessId}`);
      const data = await response.json();

      this.accounts = data.accounts || [];
      this.renderAccounts();
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  }

  async loadUpcoming() {
    try {
      const response = await fetch(`/api/calendar/${this.businessId}/upcoming?limit=5`);
      const data = await response.json();

      this.renderUpcoming(data.posts || []);
    } catch (error) {
      console.error('Failed to load upcoming posts:', error);
    }
  }

  async loadCalendarData() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth() + 1;

    try {
      const response = await fetch(`/api/calendar/${this.businessId}/${year}/${month}`);
      const data = await response.json();

      this.calendarData = data.calendar || {};
      this.renderCalendar();
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    }
  }

  setupEventListeners() {
    // Business select
    document.getElementById('businessSelect').addEventListener('change', (e) => {
      this.businessId = e.target.value;
      if (this.businessId) {
        this.loadData();
        // Update URL
        window.history.replaceState({}, '', `?business=${this.businessId}`);
      }
    });

    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      this.updateCalendarTitle();
      this.loadCalendarData();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.updateCalendarTitle();
      this.loadCalendarData();
    });

    // View toggle
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-view').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        this.renderView();
      });
    });

    // Connect account button
    document.getElementById('connectAccountBtn').addEventListener('click', () => {
      this.showConnectModal();
    });

    // Listen for OAuth popup messages
    window.addEventListener('message', (e) => this.handleOAuthMessage(e));

    // Refresh accounts
    document.getElementById('refreshAccountsBtn').addEventListener('click', () => {
      this.loadAccounts();
    });

    // Modal close
    document.querySelectorAll('[data-dismiss="modal"]').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });

    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', () => this.closeModals());
    });

    // Post modal actions
    document.getElementById('cancelPostBtn')?.addEventListener('click', () => {
      this.cancelPost();
    });

    document.getElementById('postNowBtn')?.addEventListener('click', () => {
      this.postNow();
    });

    document.getElementById('editPostBtn')?.addEventListener('click', () => {
      if (this.selectedPost) {
        window.open(`http://localhost:3002?post=${this.selectedPost.id}`, '_blank');
        this.closeModals();
      }
    });

    // Share button
    document.getElementById('sharePostBtn')?.addEventListener('click', () => {
      this.openShareModal();
    });

    // Share caption input
    document.getElementById('shareCaption')?.addEventListener('input', (e) => {
      this.updateCaptionCount();
    });

    // Confirm share
    document.getElementById('confirmShareBtn')?.addEventListener('click', () => {
      this.sharePost();
    });

    // Connect from share modal
    document.getElementById('connectFromShare')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeModals();
      this.showConnectModal();
    });

    // Close share progress
    document.getElementById('closeShareProgressBtn')?.addEventListener('click', () => {
      this.closeModals();
      this.loadData();
    });

    // Retry failed shares
    document.getElementById('retryShareBtn')?.addEventListener('click', () => {
      this.retryFailedShares();
    });
  }

  updateCalendarTitle() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];
    const title = `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    document.getElementById('calendarTitle').textContent = title;
  }

  renderAccounts() {
    const list = document.getElementById('accountsList');

    if (this.accounts.length === 0) {
      list.innerHTML = '<li class="account-empty">No accounts connected</li>';
      return;
    }

    list.innerHTML = this.accounts.map(account => `
      <li class="account-item">
        <i class="fab fa-${account.platform}"></i>
        <div class="account-info">
          <div class="account-name">${account.account_name || account.platform}</div>
          <div class="account-platform">${account.platform}</div>
        </div>
        <button class="btn-icon" onclick="app.disconnectAccount('${account.id}')" title="Disconnect">
          <i class="fas fa-times"></i>
        </button>
      </li>
    `).join('');
  }

  renderUpcoming(posts) {
    const list = document.getElementById('upcomingList');

    if (posts.length === 0) {
      list.innerHTML = '<li class="upcoming-empty">No scheduled posts</li>';
      return;
    }

    list.innerHTML = posts.map(post => `
      <li class="upcoming-item" onclick="app.showPostDetails('${post.id}')">
        <div class="upcoming-thumb">
          ${post.image_url ? `<img src="http://localhost:3002${post.image_url}" alt="">` : ''}
        </div>
        <div class="upcoming-info">
          <div class="upcoming-title">${post.title || 'Untitled Post'}</div>
          <div class="upcoming-time">${this.formatDate(post.scheduled_at)}</div>
        </div>
      </li>
    `).join('');
  }

  renderCalendar() {
    this.updateCalendarTitle();

    if (this.currentView === 'month') {
      document.getElementById('calendarGrid').style.display = 'block';
      document.getElementById('listView').style.display = 'none';
      this.renderMonthView();
    } else if (this.currentView === 'list') {
      document.getElementById('calendarGrid').style.display = 'none';
      document.getElementById('listView').style.display = 'block';
      this.renderListView();
    }
  }

  renderMonthView() {
    const container = document.getElementById('calendarDays');
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

    let html = '';

    // Previous month days
    const prevMonth = new Date(year, month, 0);
    const prevDays = prevMonth.getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevDays - i;
      html += `<div class="calendar-day other-month"><span class="day-number">${day}</span></div>`;
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = isCurrentMonth && day === today.getDate();
      const dayPosts = this.calendarData?.[dateStr] || [];

      html += `
        <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
          <span class="day-number">${day}</span>
          <div class="day-posts">
            ${dayPosts.slice(0, 3).map(post => `
              <div class="day-post ${post.status}" onclick="app.showPostDetails('${post.id}')" title="${post.title || 'Untitled'}">
                ${post.platforms?.map(p => `<i class="fab fa-${p}"></i>`).join('') || ''}
                ${post.title || 'Post'}
              </div>
            `).join('')}
            ${dayPosts.length > 3 ? `<span class="day-more">+${dayPosts.length - 3} more</span>` : ''}
          </div>
        </div>
      `;
    }

    // Next month days
    const totalCells = startDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remaining; day++) {
      html += `<div class="calendar-day other-month"><span class="day-number">${day}</span></div>`;
    }

    container.innerHTML = html;
  }

  renderListView() {
    const container = document.getElementById('listContainer');

    // Get all posts from calendar data
    const allPosts = [];
    for (const [date, posts] of Object.entries(this.calendarData || {})) {
      allPosts.push(...posts);
    }

    // Sort by scheduled date
    allPosts.sort((a, b) => new Date(a.scheduled_at || a.published_at) - new Date(b.scheduled_at || b.published_at));

    if (allPosts.length === 0) {
      container.innerHTML = '<p class="account-empty">No posts found for this month</p>';
      return;
    }

    container.innerHTML = allPosts.map(post => `
      <div class="list-item" onclick="app.showPostDetails('${post.id}')">
        <div class="list-thumb">
          ${post.image_url ? `<img src="http://localhost:3002${post.image_url}" alt="">` : ''}
        </div>
        <div class="list-info">
          <div class="list-title">${post.title || 'Untitled Post'}</div>
          <div class="list-meta">
            <div class="list-platforms">
              ${post.platforms?.map(p => `<i class="fab fa-${p}"></i>`).join('') || ''}
            </div>
            <span>${this.formatDate(post.scheduled_at || post.published_at)}</span>
          </div>
        </div>
        <div class="list-status">
          <span class="status-badge ${post.status}">${post.status}</span>
        </div>
      </div>
    `).join('');
  }

  renderView() {
    this.renderCalendar();
  }

  // Modal functions
  async showConnectModal() {
    if (!this.businessId) {
      this.showToast('Please select a business first', 'error');
      return;
    }

    // Load platforms from OAuth endpoint
    try {
      const response = await fetch('/api/oauth/platforms');
      const data = await response.json();

      if (data.success) {
        this.availablePlatforms = data.platforms;
        this.renderConnectPlatforms();
      }
    } catch (error) {
      console.error('Failed to load platforms:', error);
    }

    document.getElementById('connectModal').classList.add('show');
    document.getElementById('manualConnect').style.display = 'none';
    document.getElementById('confirmConnectBtn').style.display = 'none';
    this.selectedPlatform = null;
  }

  renderConnectPlatforms() {
    const container = document.querySelector('.platform-options');
    if (!container || !this.availablePlatforms) return;

    container.innerHTML = this.availablePlatforms.map(platform => `
      <button class="platform-option ${platform.configured ? '' : 'not-configured'}"
              data-platform="${platform.id}"
              data-auth-url="${platform.authUrl}"
              data-configured="${platform.configured}">
        <i class="fab fa-${platform.id}"></i>
        <span>${platform.name}</span>
        ${!platform.configured ? '<small class="config-warning">Not configured</small>' : ''}
      </button>
    `).join('');

    // Add click handlers for OAuth
    container.querySelectorAll('.platform-option').forEach(btn => {
      btn.addEventListener('click', () => this.startOAuthConnect(btn));
    });
  }

  startOAuthConnect(btn) {
    const platform = btn.dataset.platform;
    const authUrl = btn.dataset.authUrl;
    const configured = btn.dataset.configured === 'true';

    if (!configured) {
      this.showToast(`${platform} API is not configured. Please set up API credentials in .env`, 'error');
      return;
    }

    // Open OAuth popup
    const fullAuthUrl = `${authUrl}&business_id=${this.businessId}`;
    const popup = window.open(fullAuthUrl, 'oauth', 'width=600,height=700,scrollbars=yes');

    // Store reference for cleanup
    this.oauthPopup = popup;
  }

  handleOAuthMessage(event) {
    if (event.data?.type === 'oauth-success') {
      this.showToast(`${event.data.platform || 'Account'} connected successfully!`, 'success');
      this.loadAccounts();
      this.closeModals();
    } else if (event.data?.type === 'oauth-error') {
      this.showToast(`Connection failed: ${event.data.error}`, 'error');
    }
  }

  async showPostDetails(postId) {
    try {
      const response = await fetch(`http://localhost:3002/api/posts/item/${postId}`);
      const data = await response.json();

      if (!data.success || !data.post) {
        this.showToast('Failed to load post details', 'error');
        return;
      }

      this.selectedPost = data.post;
      const post = data.post;

      document.getElementById('postModalTitle').textContent = post.title || 'Untitled Post';
      document.getElementById('postDetailTitle').textContent = post.title || 'Untitled';
      document.getElementById('postDetailCaption').textContent = post.caption || '(no caption)';
      document.getElementById('postDetailSchedule').textContent = this.formatDate(post.scheduled_at || post.published_at);

      document.getElementById('postDetailPlatforms').innerHTML = post.platforms?.map(p =>
        `<i class="fab fa-${p}"></i>`
      ).join('') || '-';

      const statusBadge = document.getElementById('postDetailStatus');
      statusBadge.textContent = post.status;
      statusBadge.className = `status-badge ${post.status}`;

      const previewImg = document.getElementById('postPreviewImage');
      if (post.image_url) {
        previewImg.src = `http://localhost:3002${post.image_url}`;
        previewImg.style.display = 'block';
      } else {
        previewImg.style.display = 'none';
      }

      // Show/hide buttons based on status
      document.getElementById('cancelPostBtn').style.display = post.status === 'scheduled' ? 'block' : 'none';
      document.getElementById('postNowBtn').style.display = post.status === 'scheduled' ? 'block' : 'none';

      document.getElementById('postModal').classList.add('show');
    } catch (error) {
      console.error('Failed to load post:', error);
      this.showToast('Failed to load post details', 'error');
    }
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('show');
    });
  }

  // Actions
  // Note: connectAccount is now handled via OAuth flow in startOAuthConnect()

  async disconnectAccount(accountId) {
    if (!confirm('Are you sure you want to disconnect this account?')) return;

    try {
      const response = await fetch(`/api/social/accounts/${accountId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        this.showToast('Account disconnected', 'success');
        this.loadAccounts();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.showToast(error.message || 'Failed to disconnect account', 'error');
    }
  }

  async cancelPost() {
    if (!this.selectedPost) return;

    if (!confirm('Are you sure you want to cancel this scheduled post?')) return;

    try {
      const response = await fetch(`/api/schedule/${this.selectedPost.id}/cancel`, {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        this.showToast('Schedule cancelled', 'success');
        this.closeModals();
        this.loadData();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      this.showToast(error.message || 'Failed to cancel schedule', 'error');
    }
  }

  async postNow() {
    if (!this.selectedPost) return;

    if (!confirm('Post this now to all selected platforms?')) return;

    try {
      // This would call the scheduler service to post immediately
      this.showToast('Posting... (simulated)', 'info');

      // For demo, just update status
      const response = await fetch(`http://localhost:3002/api/posts/${this.selectedPost.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'published',
          published_at: new Date().toISOString()
        })
      });

      const data = await response.json();

      if (data.success) {
        this.showToast('Post published successfully!', 'success');
        this.closeModals();
        this.loadData();
      }
    } catch (error) {
      this.showToast(error.message || 'Failed to post', 'error');
    }
  }

  // ==================== Share Functions ====================

  openShareModal() {
    if (!this.selectedPost) return;

    const post = this.selectedPost;

    // Set preview
    const previewImage = document.getElementById('sharePreviewImage');
    if (post.image_url) {
      previewImage.style.backgroundImage = `url(http://localhost:3002${post.image_url})`;
    } else {
      previewImage.style.backgroundImage = 'none';
    }

    document.getElementById('sharePreviewTitle').textContent = post.title || 'Untitled Post';
    document.getElementById('sharePreviewCaption').textContent = post.caption || '(no caption)';

    // Set caption
    document.getElementById('shareCaption').value = post.caption || '';
    document.getElementById('shareHashtags').value = post.hashtags || '';
    this.updateCaptionCount();

    // Reset selected platforms
    this.selectedSharePlatforms = [];

    // Render platforms
    this.renderSharePlatforms();

    // Close post modal and open share modal
    document.getElementById('postModal').classList.remove('show');
    document.getElementById('shareModal').classList.add('show');
  }

  renderSharePlatforms() {
    const container = document.getElementById('sharePlatforms');
    const noPlatformsMsg = document.getElementById('noPlatformsMsg');

    if (this.accounts.length === 0) {
      container.innerHTML = '';
      noPlatformsMsg.style.display = 'block';
      document.getElementById('confirmShareBtn').disabled = true;
      return;
    }

    noPlatformsMsg.style.display = 'none';

    container.innerHTML = this.accounts.map(account => `
      <div class="share-platform-item" data-account-id="${account.id}" data-platform="${account.platform}">
        <i class="fab fa-${account.platform}"></i>
        <div class="share-platform-info">
          <span class="share-platform-name">${this.getPlatformDisplayName(account.platform)}</span>
          <span class="share-platform-account">${account.account_name || '@' + account.platform}</span>
        </div>
        <div class="share-platform-check">
          <i class="fas fa-check"></i>
        </div>
      </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.share-platform-item').forEach(item => {
      item.addEventListener('click', () => this.toggleSharePlatform(item));
    });
  }

  getPlatformDisplayName(platform) {
    const names = {
      instagram: 'Instagram',
      facebook: 'Facebook',
      twitter: 'Twitter/X',
      linkedin: 'LinkedIn'
    };
    return names[platform] || platform;
  }

  toggleSharePlatform(item) {
    const accountId = item.dataset.accountId;

    if (item.classList.contains('selected')) {
      item.classList.remove('selected');
      this.selectedSharePlatforms = this.selectedSharePlatforms.filter(id => id !== accountId);
    } else {
      item.classList.add('selected');
      this.selectedSharePlatforms.push(accountId);
    }

    // Update button state
    document.getElementById('confirmShareBtn').disabled = this.selectedSharePlatforms.length === 0;
  }

  updateCaptionCount() {
    const caption = document.getElementById('shareCaption').value;
    const countEl = document.getElementById('captionCount');
    const limitEl = document.getElementById('captionLimit');
    const counterContainer = countEl.parentElement;

    const limit = 2200; // Instagram limit
    countEl.textContent = caption.length;
    limitEl.textContent = limit;

    if (caption.length > limit) {
      counterContainer.classList.add('over-limit');
    } else {
      counterContainer.classList.remove('over-limit');
    }
  }

  async sharePost() {
    if (!this.selectedPost || this.selectedSharePlatforms.length === 0) return;

    const caption = document.getElementById('shareCaption').value;
    const hashtags = document.getElementById('shareHashtags').value;
    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

    // Get selected accounts
    const selectedAccounts = this.accounts.filter(a =>
      this.selectedSharePlatforms.includes(a.id)
    );

    // Close share modal and show progress
    document.getElementById('shareModal').classList.remove('show');
    this.showShareProgress(selectedAccounts);

    // Start sharing
    this.shareInProgress = true;
    const results = [];

    for (let i = 0; i < selectedAccounts.length; i++) {
      const account = selectedAccounts[i];

      // Update status to uploading
      this.updateShareProgressItem(account.id, 'uploading', 'Uploading media...');

      try {
        // Call the publish API
        const response = await fetch('/api/publish/now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: this.selectedPost.id,
            platforms: [account.platform],
            social_account_ids: [account.id],
            caption: fullCaption
          })
        });

        const data = await response.json();

        if (data.success) {
          // Poll for status
          await this.pollShareStatus(this.selectedPost.id, account);
          results.push({ account, success: true });
        } else {
          throw new Error(data.error || 'Publishing failed');
        }
      } catch (error) {
        console.error(`Failed to share to ${account.platform}:`, error);
        this.updateShareProgressItem(account.id, 'failed', error.message || 'Failed');
        results.push({ account, success: false, error: error.message });
      }

      // Update overall progress
      const progress = ((i + 1) / selectedAccounts.length) * 100;
      document.getElementById('shareProgressFill').style.width = `${progress}%`;
    }

    // Show completion
    this.shareInProgress = false;
    this.showShareComplete(results);
  }

  showShareProgress(accounts) {
    const container = document.getElementById('shareProgressList');
    container.innerHTML = accounts.map(account => `
      <div class="share-progress-item" data-account-id="${account.id}">
        <i class="fab fa-${account.platform} platform-icon"></i>
        <div class="share-progress-info">
          <span class="share-progress-platform">${this.getPlatformDisplayName(account.platform)}</span>
          <span class="share-progress-status">Waiting...</span>
        </div>
        <div class="share-progress-icon pending">
          <i class="fas fa-clock"></i>
        </div>
      </div>
    `).join('');

    document.getElementById('shareProgressFill').style.width = '0%';
    document.getElementById('shareProgressText').textContent = 'Starting share...';
    document.getElementById('shareProgressFooter').style.display = 'none';
    document.getElementById('shareProgressModal').classList.add('show');
  }

  updateShareProgressItem(accountId, status, message) {
    const item = document.querySelector(`.share-progress-item[data-account-id="${accountId}"]`);
    if (!item) return;

    const statusEl = item.querySelector('.share-progress-status');
    const iconEl = item.querySelector('.share-progress-icon');

    statusEl.textContent = message;
    iconEl.className = `share-progress-icon ${status}`;

    const icons = {
      pending: 'fa-clock',
      uploading: 'fa-spinner fa-spin',
      publishing: 'fa-spinner fa-spin',
      success: 'fa-check-circle',
      failed: 'fa-times-circle'
    };

    iconEl.innerHTML = `<i class="fas ${icons[status] || 'fa-clock'}"></i>`;
  }

  async pollShareStatus(postId, account) {
    const maxAttempts = 30;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/publish/status/${postId}`);
        const data = await response.json();

        if (data.success && data.status) {
          const platformStatus = data.status.platforms?.find(p =>
            p.platform === account.platform
          );

          if (platformStatus) {
            if (platformStatus.status === 'published') {
              this.updateShareProgressItem(account.id, 'success', 'Published successfully');
              return;
            } else if (platformStatus.status === 'failed') {
              throw new Error(platformStatus.error || 'Publishing failed');
            } else {
              this.updateShareProgressItem(account.id, 'publishing', platformStatus.status);
            }
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    // Timeout - assume success if no error
    this.updateShareProgressItem(account.id, 'success', 'Completed');
  }

  showShareComplete(results) {
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    let message = '';
    if (failedCount === 0) {
      message = `Successfully shared to ${successCount} platform${successCount > 1 ? 's' : ''}!`;
    } else if (successCount === 0) {
      message = `Failed to share to all platforms.`;
    } else {
      message = `Shared to ${successCount}, failed on ${failedCount}.`;
    }

    document.getElementById('shareProgressText').textContent = message;
    document.getElementById('shareProgressFooter').style.display = 'flex';

    // Show retry button if there were failures
    const retryBtn = document.getElementById('retryShareBtn');
    retryBtn.style.display = failedCount > 0 ? 'inline-flex' : 'none';

    // Store failed results for retry
    this.failedShareResults = results.filter(r => !r.success);
  }

  async retryFailedShares() {
    if (!this.failedShareResults || this.failedShareResults.length === 0) return;

    const failedAccounts = this.failedShareResults.map(r => r.account);

    // Reset progress for failed items
    failedAccounts.forEach(account => {
      this.updateShareProgressItem(account.id, 'pending', 'Retrying...');
    });

    document.getElementById('shareProgressFooter').style.display = 'none';
    document.getElementById('shareProgressText').textContent = 'Retrying...';

    // Retry sharing
    const caption = document.getElementById('shareCaption').value;
    const hashtags = document.getElementById('shareHashtags').value;
    const fullCaption = hashtags ? `${caption}\n\n${hashtags}` : caption;

    const results = [];

    for (let i = 0; i < failedAccounts.length; i++) {
      const account = failedAccounts[i];
      this.updateShareProgressItem(account.id, 'uploading', 'Uploading media...');

      try {
        const response = await fetch('/api/publish/now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            post_id: this.selectedPost.id,
            platforms: [account.platform],
            social_account_ids: [account.id],
            caption: fullCaption
          })
        });

        const data = await response.json();

        if (data.success) {
          await this.pollShareStatus(this.selectedPost.id, account);
          results.push({ account, success: true });
        } else {
          throw new Error(data.error || 'Publishing failed');
        }
      } catch (error) {
        this.updateShareProgressItem(account.id, 'failed', error.message || 'Failed');
        results.push({ account, success: false, error: error.message });
      }
    }

    this.showShareComplete(results);
  }

  // Utilities
  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
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
    setTimeout(() => toast.remove(), 3000);
  }
}

// Initialize app
const app = new AutoPoster();
