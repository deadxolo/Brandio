const db = require('../../shared/db/database');
const publishingService = require('./publishingService');

class SchedulerService {
  constructor() {
    this.maxRetries = 3;
  }

  async processScheduledPosts() {
    // Reload database to get latest data
    db.reload();

    // Get pending jobs that are due
    const pendingJobs = db.getPendingJobs(10);

    if (pendingJobs.length === 0) {
      return { processed: 0 };
    }

    console.log(`[Scheduler] Processing ${pendingJobs.length} pending jobs...`);

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        console.log(`[Scheduler] Processing job ${job.id} for post ${job.post_id} on ${job.platform}`);
        console.log(`[Scheduler] Scheduled time: ${job.scheduled_at}, Current time: ${new Date().toISOString()}`);

        await this.processJob(job);
        processed++;
        succeeded++;

        console.log(`[Scheduler] Job ${job.id} completed successfully`);
      } catch (error) {
        console.error(`[Scheduler] Error processing job ${job.id}:`, error.message);
        this.handleJobError(job, error);
        processed++;
        failed++;
      }
    }

    console.log(`[Scheduler] Finished: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);
    return { processed, succeeded, failed };
  }

  async processJob(job) {
    console.log(`[Scheduler] Processing job ${job.id} for platform ${job.platform}`);

    // Get the post
    const post = db.getPost(job.post_id);
    if (!post) {
      throw new Error('Post not found');
    }

    // Always use the real publishing service - same as immediate publishing
    try {
      const result = await publishingService.processJob(job);
      this.checkPostCompletion(job.post_id);
      return result;
    } catch (error) {
      // Update job status and check post completion even on failure
      this.checkPostCompletion(job.post_id);
      throw error;
    }
  }

  handleJobError(job, error) {
    const attempts = (job.attempts || 0) + 1;

    if (attempts >= this.maxRetries) {
      // Mark as failed
      db.updateScheduledJob(job.id, {
        status: 'failed',
        result: JSON.stringify({ error: error.message }),
        attempts
      });

      console.log(`[Scheduler] Job ${job.id} failed after ${attempts} attempts`);

      // Check if all jobs for this post are done
      this.checkPostCompletion(job.post_id);
    } else {
      // Keep as pending for retry with a delay
      const retryDelay = Math.min(attempts * 60000, 300000); // 1-5 minutes
      const retryAt = new Date(Date.now() + retryDelay).toISOString();

      db.updateScheduledJob(job.id, {
        status: 'pending',
        scheduled_at: retryAt,
        result: JSON.stringify({ error: error.message, willRetry: true, retryAt }),
        attempts
      });

      console.log(`[Scheduler] Job ${job.id} will retry at ${retryAt} (attempt ${attempts}/${this.maxRetries})`);
    }
  }

  checkPostCompletion(postId) {
    // Reload to get latest job data
    db.reload();

    // Check if all jobs for this post are completed
    const jobs = db.getJobsByPost(postId);

    if (!jobs || jobs.length === 0) {
      return;
    }

    const completedJobs = jobs.filter(j => j.status === 'completed');
    const failedJobs = jobs.filter(j => j.status === 'failed');
    const pendingOrProcessing = jobs.filter(j => j.status === 'pending' || j.status === 'processing');

    // If there are still pending or processing jobs, wait
    if (pendingOrProcessing.length > 0) {
      return;
    }

    // All jobs are done (either completed or failed)
    if (completedJobs.length === jobs.length) {
      // All succeeded
      db.updatePost(postId, {
        status: 'published',
        published_at: new Date().toISOString()
      });
      console.log(`[Scheduler] Post ${postId} marked as published (all ${jobs.length} jobs succeeded)`);
    } else if (failedJobs.length === jobs.length) {
      // All failed
      db.updatePost(postId, {
        status: 'failed'
      });
      console.log(`[Scheduler] Post ${postId} marked as failed (all ${jobs.length} jobs failed)`);
    } else if (completedJobs.length > 0 && failedJobs.length > 0) {
      // Partial success - some completed, some failed
      db.updatePost(postId, {
        status: 'partial',
        published_at: new Date().toISOString()
      });
      console.log(`[Scheduler] Post ${postId} marked as partial (${completedJobs.length} succeeded, ${failedJobs.length} failed)`);
    }
  }

  // Manual post now - uses the same publishing logic as immediate publish
  async postNow(postId, platforms = null) {
    const post = db.getPost(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    const targetPlatforms = platforms || post.platforms || [];

    // Use the publishing service for immediate publishing
    const results = await publishingService.publishPost(postId, targetPlatforms, {
      immediate: true
    });

    return results;
  }
}

module.exports = new SchedulerService();
