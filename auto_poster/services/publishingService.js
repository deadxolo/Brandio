// Publishing Service - Unified orchestrator for social media publishing
const db = require('../../shared/db/database');
const platformsConfig = require('../../shared/config/platforms');
const tokenService = require('./tokenService');
const { v4: uuidv4 } = require('uuid');

class PublishingService {
  constructor() {
    this.platformServices = {};
    this.maxRetries = 3;
    this.retryDelays = [1000, 5000, 15000]; // Progressive retry delays
  }

  // Register platform services (called during initialization)
  registerPlatformService(platform, service) {
    this.platformServices[platform] = service;
    console.log(`[PublishingService] Registered ${platform} service`);
  }

  // Get platform service
  getPlatformService(platform) {
    // Map instagram/facebook to meta service
    const serviceName = ['instagram', 'facebook'].includes(platform) ? 'meta' : platform;
    return this.platformServices[serviceName];
  }

  // Main entry point: Publish a post to selected platforms
  async publishPost(postId, platforms, options = {}) {
    // Reload database to get latest data
    db.reload();

    const post = db.getPost(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    // Check if this is a scheduled publish (not immediate)
    const isScheduled = options.immediate === false && options.scheduledAt;

    console.log(`[PublishingService] ${isScheduled ? 'Scheduling' : 'Publishing'} post ${postId} to platforms:`, platforms);

    const results = {
      postId,
      jobs: [],
      success: [],
      failed: [],
      overall: isScheduled ? 'scheduled' : 'pending'
    };

    // Create jobs for each platform/account
    const accountIds = options.social_account_ids || [];

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const accountId = accountIds[i] || null;  // Match account to platform by index
      const job = await this.createPublishingJob(post, platform, { ...options, social_account_id: accountId });
      results.jobs.push(job);
    }

    // If immediate publishing requested (not scheduled)
    if (options.immediate !== false) {
      await this.processJobs(results.jobs, results);
      // Update post status only for immediate publishing
      this.updatePostStatus(postId, results);
    }
    // For scheduled posts, status is already set to 'scheduled' by the schedule endpoint

    return results;
  }

  // Create a publishing job for a platform
  async createPublishingJob(post, platform, options = {}) {
    const scheduledAt = options.scheduledAt || new Date().toISOString();

    // Use specific account ID if provided, otherwise find by platform
    let account = null;
    if (options.social_account_id) {
      account = db.getSocialAccount(options.social_account_id);
    }
    if (!account) {
      account = db.getSocialAccountByPlatform(post.business_id, platform);
    }

    console.log(`[PublishingService] Creating job for ${platform}, account:`, account?.account_name || 'none');

    const job = db.createScheduledJob({
      post_id: post.id,
      platform,
      social_account_id: account?.id || null,
      scheduled_at: scheduledAt,
      status: options.scheduledAt ? 'pending' : 'processing'
    });

    this.logAction({
      post_id: post.id,
      job_id: job.id,
      platform,
      action: 'job_created',
      status: 'success',
      request_data: JSON.stringify({ scheduledAt, hasAccount: !!account, accountName: account?.account_name })
    });

    return job;
  }

  // Process multiple jobs
  async processJobs(jobs, results) {
    for (const job of jobs) {
      try {
        const result = await this.processJob(job);
        if (result.success) {
          results.success.push({ platform: job.platform, result });
        } else {
          results.failed.push({ platform: job.platform, error: result.error });
        }
      } catch (error) {
        results.failed.push({ platform: job.platform, error: error.message });
      }
    }

    // Determine overall status
    if (results.failed.length === 0 && results.success.length > 0) {
      results.overall = 'published';
    } else if (results.success.length > 0 && results.failed.length > 0) {
      results.overall = 'partial';
    } else if (results.failed.length > 0) {
      results.overall = 'failed';
    }
  }

  // Process a single publishing job
  async processJob(job) {
    const startTime = Date.now();

    // Reload to get latest data
    db.reload();

    const post = db.getPost(job.post_id);

    if (!post) {
      return this.handleJobFailure(job, 'Post not found', 'POST_NOT_FOUND');
    }

    // Get social account
    let account = job.social_account_id ? db.getSocialAccount(job.social_account_id) : null;
    if (!account) {
      account = db.getSocialAccountByPlatform(post.business_id, job.platform);
    }

    console.log(`[PublishingService] Processing platform: ${job.platform}`);
    console.log(`[PublishingService] Account found:`, account ? {
      id: account.id,
      platform: account.platform,
      name: account.account_name,
      page_id: account.page_id,
      instagram_account_id: account.instagram_account_id
    } : 'NONE');

    if (!account) {
      return this.handleJobFailure(job, `No connected account for ${job.platform}`, 'NO_ACCOUNT');
    }

    // Check token validity
    if (tokenService.isTokenExpired(account)) {
      const refreshResult = await this.refreshAccountToken(account, job.platform);
      if (!refreshResult.success) {
        return this.handleJobFailure(job, 'Token expired and refresh failed', 'TOKEN_EXPIRED');
      }
      // Reload account with new tokens
      account = db.getSocialAccount(account.id);
    }

    // Get platform service
    const platformService = this.getPlatformService(job.platform);
    if (!platformService) {
      return this.handleJobFailure(job, `No service available for ${job.platform}`, 'SERVICE_UNAVAILABLE');
    }

    try {
      // Mark job as processing
      db.updateScheduledJob(job.id, { status: 'processing' });

      // Validate post for platform
      const validation = await this.validatePostForPlatform(post, job.platform);
      if (!validation.valid) {
        return this.handleJobFailure(job, validation.errors.join(', '), 'VALIDATION_FAILED');
      }

      // Upload media if present
      let mediaId = null;
      if (post.image_url) {
        mediaId = await this.uploadMediaToPlatform(post, job.platform, account, job);
      }

      // Execute publish
      const publishResult = await this.executePublish(post, job.platform, account, mediaId, job);

      // Handle success
      const duration = Date.now() - startTime;
      return this.handleJobSuccess(job, publishResult, duration);

    } catch (error) {
      console.error(`[PublishingService] Error processing job ${job.id}:`, error);

      // Check if error is retryable
      if (this.isRetryableError(error) && job.attempts < this.maxRetries) {
        return this.scheduleRetry(job, error);
      }

      return this.handleJobFailure(job, error.message, error.code || 'UNKNOWN_ERROR');
    }
  }

  // Validate post content for a specific platform
  async validatePostForPlatform(post, platform) {
    const errors = [];

    // Check if platform is configured
    if (!platformsConfig.isConfigured(platform)) {
      errors.push(`${platform} is not configured`);
    }

    // Get media requirements
    const mediaReqs = platformsConfig.getMediaRequirements(platform);

    // Validate caption/text length
    const config = platformsConfig.getPlatformConfig(platform);
    if (config?.characterLimits) {
      const textLength = (post.caption || '').length + (post.hashtags || '').length;
      const limit = config.characterLimits.tweet || config.characterLimits.post || 2200;
      if (textLength > limit) {
        errors.push(`Text exceeds ${limit} character limit for ${platform}`);
      }
    }

    // For Instagram, caption + hashtags shouldn't exceed 2200
    if (platform === 'instagram') {
      const totalLength = (post.caption || '').length + (post.hashtags || '').length;
      if (totalLength > 2200) {
        errors.push('Instagram caption and hashtags exceed 2200 characters');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Upload media to platform
  async uploadMediaToPlatform(post, platform, account, job) {
    const platformService = this.getPlatformService(platform);
    if (!platformService || !platformService.uploadMedia) {
      return null;
    }

    this.logAction({
      post_id: post.id,
      job_id: job.id,
      platform,
      action: 'upload_media',
      status: 'started'
    });

    const startTime = Date.now();

    try {
      // Get decrypted tokens
      const tokens = tokenService.getDecryptedTokens(account);

      const result = await platformService.uploadMedia(post.image_url, {
        account,
        tokens,
        caption: this.formatCaption(post.caption, post.hashtags),
        platform
      });

      this.logAction({
        post_id: post.id,
        job_id: job.id,
        platform,
        action: 'upload_media',
        status: 'success',
        response_data: JSON.stringify({ mediaId: result.mediaId }),
        duration_ms: Date.now() - startTime
      });

      return result.mediaId;

    } catch (error) {
      this.logAction({
        post_id: post.id,
        job_id: job.id,
        platform,
        action: 'upload_media',
        status: 'failed',
        error_message: error.message,
        error_code: error.code,
        duration_ms: Date.now() - startTime
      });

      throw error;
    }
  }

  // Execute the actual publish
  async executePublish(post, platform, account, mediaId, job) {
    const platformService = this.getPlatformService(platform);
    if (!platformService) {
      throw new Error(`No service for ${platform}`);
    }

    this.logAction({
      post_id: post.id,
      job_id: job.id,
      platform,
      action: 'publish',
      status: 'started'
    });

    const startTime = Date.now();

    try {
      const tokens = tokenService.getDecryptedTokens(account);

      const result = await platformService.publish({
        post,
        account,
        tokens,
        mediaId,
        caption: this.formatCaption(post.caption, post.hashtags),
        platform
      });

      this.logAction({
        post_id: post.id,
        job_id: job.id,
        platform,
        action: 'publish',
        status: 'success',
        response_data: JSON.stringify(result),
        duration_ms: Date.now() - startTime
      });

      // Record platform post
      if (result.platformPostId) {
        db.createPlatformPost({
          post_id: post.id,
          platform,
          platform_post_id: result.platformPostId,
          platform_url: result.platformUrl
        });
      }

      return result;

    } catch (error) {
      this.logAction({
        post_id: post.id,
        job_id: job.id,
        platform,
        action: 'publish',
        status: 'failed',
        error_message: error.message,
        error_code: error.code,
        duration_ms: Date.now() - startTime
      });

      throw error;
    }
  }

  // Refresh account token
  async refreshAccountToken(account, platform) {
    const platformService = this.getPlatformService(platform);
    if (!platformService || !platformService.refreshToken) {
      return { success: false, error: 'Refresh not supported' };
    }

    this.logAction({
      platform,
      action: 'refresh_token',
      status: 'started',
      request_data: JSON.stringify({ accountId: account.id })
    });

    try {
      const tokens = tokenService.getDecryptedTokens(account);
      const result = await platformService.refreshToken(tokens.refresh_token);

      // Store new tokens (encrypted)
      const encryptedTokens = tokenService.prepareForStorage(result);
      db.updateSocialAccount(account.id, encryptedTokens);

      this.logAction({
        platform,
        action: 'refresh_token',
        status: 'success'
      });

      return { success: true };

    } catch (error) {
      this.logAction({
        platform,
        action: 'refresh_token',
        status: 'failed',
        error_message: error.message
      });

      return { success: false, error: error.message };
    }
  }

  // Handle successful job completion
  handleJobSuccess(job, result, duration) {
    db.updateScheduledJob(job.id, {
      status: 'completed',
      result: JSON.stringify(result)
    });

    this.logAction({
      post_id: job.post_id,
      job_id: job.id,
      platform: job.platform,
      action: 'job_completed',
      status: 'success',
      duration_ms: duration
    });

    return { success: true, result };
  }

  // Handle job failure
  handleJobFailure(job, errorMessage, errorCode) {
    const attempts = (job.attempts || 0) + 1;

    db.updateScheduledJob(job.id, {
      status: 'failed',
      result: JSON.stringify({ error: errorMessage, code: errorCode }),
      attempts
    });

    this.logAction({
      post_id: job.post_id,
      job_id: job.id,
      platform: job.platform,
      action: 'job_failed',
      status: 'failed',
      error_message: errorMessage,
      error_code: errorCode
    });

    return { success: false, error: errorMessage, code: errorCode };
  }

  // Schedule a retry for a failed job
  scheduleRetry(job, error) {
    const attempts = (job.attempts || 0) + 1;
    const delay = this.retryDelays[Math.min(attempts - 1, this.retryDelays.length - 1)];
    const retryAt = new Date(Date.now() + delay).toISOString();

    db.updateScheduledJob(job.id, {
      status: 'pending',
      scheduled_at: retryAt,
      result: JSON.stringify({ lastError: error.message, willRetry: true }),
      attempts
    });

    this.logAction({
      post_id: job.post_id,
      job_id: job.id,
      platform: job.platform,
      action: 'retry_scheduled',
      status: 'started',
      request_data: JSON.stringify({ retryAt, attempt: attempts })
    });

    return { success: false, error: error.message, retrying: true, retryAt };
  }

  // Check if an error is retryable
  isRetryableError(error) {
    const retryableCodes = platformsConfig.retryableErrors || [];
    return retryableCodes.includes(error.code) ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNRESET') ||
      error.message?.includes('rate limit') ||
      (error.status >= 500 && error.status < 600);
  }

  // Update post status based on results
  updatePostStatus(postId, results) {
    let status = 'draft';

    if (results.overall === 'published') {
      status = 'published';
    } else if (results.overall === 'partial') {
      status = 'partial';
    } else if (results.overall === 'failed') {
      status = 'failed';
    } else if (results.overall === 'scheduled') {
      status = 'scheduled';
    }

    const updateData = { status };
    if (status === 'published') {
      updateData.published_at = new Date().toISOString();
    }

    db.updatePost(postId, updateData);
  }

  // Format caption with hashtags
  formatCaption(caption, hashtags) {
    let text = caption || '';
    if (hashtags) {
      text += text ? '\n\n' : '';
      text += hashtags;
    }
    return text;
  }

  // Log a publishing action
  logAction(data) {
    try {
      db.createPublishingLog(data);
    } catch (error) {
      console.error('[PublishingService] Failed to log action:', error);
    }
  }

  // Get publishing status for a post
  getPublishingStatus(postId) {
    return db.getPostPublishingStatus(postId);
  }

  // Get publishing logs for a post
  getPublishingLogs(postId) {
    return db.getPublishingLogsByPost(postId);
  }

  // Cancel a pending job
  cancelJob(jobId) {
    const job = db.getScheduledJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'pending') {
      throw new Error('Can only cancel pending jobs');
    }

    db.updateScheduledJob(jobId, { status: 'cancelled' });

    this.logAction({
      job_id: jobId,
      platform: job.platform,
      action: 'job_cancelled',
      status: 'success'
    });

    return { success: true };
  }

  // Retry a failed job
  async retryJob(jobId) {
    const job = db.getScheduledJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'failed') {
      throw new Error('Can only retry failed jobs');
    }

    // Reset job status
    db.updateScheduledJob(jobId, {
      status: 'processing',
      result: null
    });

    // Process the job
    return await this.processJob(job);
  }
}

// Export singleton instance
module.exports = new PublishingService();
