/**
 * Background Engine Usage Examples
 *
 * These examples show how to integrate the background engine
 * with auto_poster, manager, and post_generator services.
 */

const BackgroundClient = require('../client/BackgroundClient');

// Initialize client
const bgClient = new BackgroundClient({
  baseUrl: 'http://localhost:3001'
});

/**
 * Example 1: Auto Poster Integration
 * Get background for today's festivals automatically
 */
async function autoPosterExample() {
  console.log('\n=== Auto Poster Example ===\n');

  // Check today's festivals
  const festivals = await bgClient.getFestivalsToday();
  console.log('Today\'s festivals:', festivals.festivals);

  if (festivals.hasBackgrounds) {
    console.log('Backgrounds available:', festivals.backgrounds.length);
    // Use first background for posting
    const background = festivals.backgrounds[0];
    console.log('Using background:', background.prompt);
  } else if (festivals.festivals.length > 0) {
    // Generate new background for today's festival
    console.log('Generating new background for:', festivals.festivals[0]);
    const result = await bgClient.generate(
      `${festivals.festivals[0]} celebration background`,
      { category: 'festival', style: 'festive' }
    );
    console.log('Generated:', result.background?.filename);
  }
}

/**
 * Example 2: Post Generator Integration
 * Get background based on post content
 */
async function postGeneratorExample() {
  console.log('\n=== Post Generator Example ===\n');

  const postContent = 'Wishing everyone a happy and prosperous Diwali! May the festival of lights bring joy to your life.';

  // Find best matching background
  const result = await bgClient.forPost(postContent, {
    platform: 'instagram',
    mood: 'festive',
    category: 'festival'
  });

  if (result.source === 'matched') {
    console.log('Found matching backgrounds:', result.backgrounds.length);
    console.log('Recommended:', result.recommendation?.prompt);
    console.log('Keywords extracted:', result.extractedKeywords);
  } else {
    console.log('No match found, suggestion:', result.suggestion);
  }
}

/**
 * Example 3: Manager Dashboard Integration
 * Get statistics for dashboard
 */
async function managerExample() {
  console.log('\n=== Manager Dashboard Example ===\n');

  const stats = await bgClient.getStats();

  console.log('Total backgrounds:', stats.stats.totalBackgrounds);
  console.log('By category:', stats.stats.byCategory);
  console.log('By occasion:', stats.stats.byOccasion);
}

/**
 * Example 4: Smart Background Retrieval
 * Automatically find or generate backgrounds
 */
async function smartRetrievalExample() {
  console.log('\n=== Smart Retrieval Example ===\n');

  // This will first search for existing backgrounds
  // If none found and autoGenerate is true, it will create a new one
  const result = await bgClient.getBackground('christmas winter celebration', {
    category: 'festival',
    style: 'festive',
    preferExisting: true,
    autoGenerate: true
  });

  console.log('Source:', result.source);
  if (result.background) {
    console.log('Background:', result.background.prompt);
    console.log('Image URL:', bgClient.getImageUrl(result.background.imagePath));
  }
}

/**
 * Example 5: Batch Processing
 * Get backgrounds for multiple posts at once
 */
async function batchExample() {
  console.log('\n=== Batch Processing Example ===\n');

  const queries = [
    { query: 'diwali', category: 'festival' },
    { query: 'christmas', category: 'festival' },
    { query: 'business promotion', category: 'business' },
    { query: 'nature landscape', category: 'nature' }
  ];

  const results = await bgClient.batchBackgrounds(queries);

  console.log('Batch results:');
  console.log('- Found:', results.summary.found);
  console.log('- Needs generation:', results.summary.needsGeneration);

  for (const item of results.results) {
    console.log(`  ${item.query}: ${item.source}`);
  }
}

/**
 * Example 6: Search and Filter
 */
async function searchExample() {
  console.log('\n=== Search Example ===\n');

  // Search by query
  const searchResults = await bgClient.search('festival', { limit: 5 });
  console.log('Search results:', searchResults.count);

  // Get by occasion
  const diwaliBackgrounds = await bgClient.getByOccasion('diwali');
  console.log('Diwali backgrounds:', diwaliBackgrounds.count);

  // List all with pagination
  const allBackgrounds = await bgClient.list({
    page: 1,
    limit: 10,
    sortBy: 'createdAt',
    order: 'desc'
  });
  console.log('Total backgrounds:', allBackgrounds.pagination.total);
}

// Run examples
async function runExamples() {
  try {
    // Check if server is healthy
    const isHealthy = await bgClient.healthCheck();
    if (!isHealthy) {
      console.error('Background engine is not running!');
      console.error('Start it with: npm start');
      return;
    }

    console.log('Background engine is healthy!\n');

    await autoPosterExample();
    await postGeneratorExample();
    await managerExample();
    await smartRetrievalExample();
    await batchExample();
    await searchExample();

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run if executed directly
if (require.main === module) {
  runExamples();
}

module.exports = {
  autoPosterExample,
  postGeneratorExample,
  managerExample,
  smartRetrievalExample,
  batchExample,
  searchExample
};
