const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Note: Canvas rendering would typically be done server-side with node-canvas
// For this implementation, we'll primarily do client-side rendering
// and use this route for saving/exporting the rendered images

const exportsDir = path.join(__dirname, '../uploads/exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Save rendered image (from client-side canvas)
router.post('/export', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    const { imageData, filename, format = 'png' } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'imageData is required'
      });
    }

    // Remove data URL prefix
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate filename
    const outputFilename = filename || `post_${Date.now()}`;
    const fullFilename = `${outputFilename}.${format}`;
    const outputPath = path.join(exportsDir, fullFilename);

    // Write file
    fs.writeFileSync(outputPath, buffer);

    res.json({
      success: true,
      message: 'Image exported successfully',
      file: {
        filename: fullFilename,
        path: outputPath,
        url: `/exports/${fullFilename}`,
        size: buffer.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save thumbnail
router.post('/thumbnail', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { imageData, templateId } = req.body;

    if (!imageData || !templateId) {
      return res.status(400).json({
        success: false,
        error: 'imageData and templateId are required'
      });
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const filename = `thumb_${templateId}.png`;
    const outputPath = path.join(exportsDir, filename);

    fs.writeFileSync(outputPath, buffer);

    res.json({
      success: true,
      thumbnailUrl: `/exports/${filename}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get exported images
router.get('/exports', (req, res) => {
  try {
    const files = fs.readdirSync(exportsDir);
    const exports = files
      .filter(f => !f.startsWith('thumb_'))
      .map(filename => ({
        filename,
        url: `/exports/${filename}`,
        created: fs.statSync(path.join(exportsDir, filename)).mtime
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({
      success: true,
      exports,
      count: exports.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch export multiple images
router.post('/batch', express.json({ limit: '100mb' }), async (req, res) => {
  try {
    const { images, format = 'png', prefix = 'post' } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'images array is required'
      });
    }

    const results = [];
    const batchId = uuidv4();
    const batchDir = path.join(exportsDir, batchId);

    // Create batch directory
    if (!fs.existsSync(batchDir)) {
      fs.mkdirSync(batchDir, { recursive: true });
    }

    // Process each image
    for (let i = 0; i < images.length; i++) {
      const { data, rowData } = images[i];

      if (!data) continue;

      // Remove data URL prefix
      const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Generate filename
      const filename = `${prefix}_${i + 1}.${format}`;
      const outputPath = path.join(batchDir, filename);

      // Write file
      fs.writeFileSync(outputPath, buffer);

      results.push({
        index: i,
        filename,
        path: outputPath,
        url: `/exports/${batchId}/${filename}`,
        size: buffer.length,
        rowData
      });
    }

    res.json({
      success: true,
      message: `Exported ${results.length} images`,
      batchId,
      files: results,
      zipUrl: `/api/render/batch/${batchId}/download`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download batch as ZIP
router.get('/batch/:batchId/download', async (req, res) => {
  try {
    const batchDir = path.join(exportsDir, req.params.batchId);

    if (!fs.existsSync(batchDir)) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    // Simple approach: Return list of files to download individually
    // For actual ZIP, would need archiver package
    const files = fs.readdirSync(batchDir);
    const fileList = files.map(f => ({
      filename: f,
      url: `/exports/${req.params.batchId}/${f}`
    }));

    res.json({
      success: true,
      batchId: req.params.batchId,
      files: fileList
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete exported image
router.delete('/exports/:filename', (req, res) => {
  try {
    const filePath = path.join(exportsDir, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
