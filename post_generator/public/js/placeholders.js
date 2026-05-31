// Placeholder Manager Utility Module
// Shared functions for placeholder handling across editor and generate pages

class PlaceholderManager {
  constructor() {
    this.placeholders = {};
  }

  // ==================== VALIDATION ====================

  validateName(name) {
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Placeholder name is required' };
    }

    const sanitized = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (sanitized.length < 2) {
      return { valid: false, error: 'Placeholder name must be at least 2 characters' };
    }

    if (sanitized.length > 50) {
      return { valid: false, error: 'Placeholder name must be less than 50 characters' };
    }

    if (/^[0-9]/.test(sanitized)) {
      return { valid: false, error: 'Placeholder name cannot start with a number' };
    }

    return { valid: true, sanitized };
  }

  isDuplicate(name, existingPlaceholders = {}, excludeId = null) {
    for (const [key, placeholder] of Object.entries(existingPlaceholders)) {
      if (key === name && placeholder.elementId !== excludeId) {
        return true;
      }
    }
    return false;
  }

  // ==================== TYPE DETECTION ====================

  detectType(property) {
    const imageProperties = ['src', 'bgImage', 'image'];
    const colorProperties = ['color', 'fill', 'stroke', 'bgColor', 'textColor'];
    const numberProperties = ['x', 'y', 'width', 'height', 'fontSize', 'opacity', 'rotation', 'strokeWidth', 'borderRadius', 'lineHeight', 'letterSpacing'];

    if (imageProperties.includes(property)) return 'image';
    if (colorProperties.includes(property)) return 'color';
    if (numberProperties.includes(property)) return 'number';
    return 'text';
  }

  getTypeIcon(type) {
    switch (type) {
      case 'image': return 'image';
      case 'color': return 'palette';
      case 'number': return 'hashtag';
      default: return 'font';
    }
  }

  getTypeLabel(type) {
    switch (type) {
      case 'image': return 'Image';
      case 'color': return 'Color';
      case 'number': return 'Number';
      default: return 'Text';
    }
  }

  // ==================== CSV PARSING ====================

  parseCSV(csvText, delimiter = ',') {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      return { success: false, error: 'CSV must have at least a header row and one data row' };
    }

    const headers = this.parseCSVLine(lines[0], delimiter);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i], delimiter);
      if (values.length === 0) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header.trim()] = values[index]?.trim() || '';
      });
      rows.push(row);
    }

    return { success: true, headers, rows };
  }

  parseCSVLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  mapCSVToPlaceholders(headers, placeholders) {
    const mapping = {};
    const unmapped = [];
    const placeholderNames = Object.keys(placeholders);

    headers.forEach(header => {
      const headerLower = header.toLowerCase().replace(/[^a-z0-9]/g, '_');

      // Try exact match first
      if (placeholderNames.includes(headerLower)) {
        mapping[header] = headerLower;
      }
      // Try fuzzy match
      else {
        const match = placeholderNames.find(name => {
          return name.includes(headerLower) || headerLower.includes(name);
        });

        if (match) {
          mapping[header] = match;
        } else {
          unmapped.push(header);
        }
      }
    });

    return { mapping, unmapped };
  }

  // ==================== VALUE SUBSTITUTION ====================

  applyValues(template, data) {
    // Deep clone the template
    const result = JSON.parse(JSON.stringify(template));

    // Apply values to elements
    if (result.elements) {
      result.elements = result.elements.map(element => {
        return this.applyValuesToElement(element, data, template.placeholders || {});
      });
    }

    // Apply values to background
    if (result.background_isDynamic && result.background_placeholder) {
      const value = data[result.background_placeholder];
      if (value) {
        result.background_value = value;
      }
    }

    return result;
  }

  applyValuesToElement(element, data, placeholders) {
    const result = { ...element };

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

    return result;
  }

  // ==================== FORM GENERATION ====================

  generateFormHTML(placeholders) {
    if (Object.keys(placeholders).length === 0) {
      return '<p class="no-placeholders">No placeholders defined in this template</p>';
    }

    return Object.entries(placeholders).map(([name, config]) => {
      return this.generateFieldHTML(name, config);
    }).join('');
  }

  generateFieldHTML(name, config) {
    const type = config.type || 'text';
    const label = this.formatLabel(name);
    const icon = this.getTypeIcon(type);

    let inputHTML = '';

    switch (type) {
      case 'image':
        inputHTML = `
          <div class="image-input-group">
            <input type="text" id="field_${name}" name="${name}" class="form-input" placeholder="Image URL or upload..." value="${config.defaultValue || ''}">
            <button type="button" class="btn-upload" data-field="${name}">
              <i class="fas fa-upload"></i>
            </button>
            <input type="file" id="file_${name}" accept="image/*" class="hidden" data-field="${name}">
          </div>
          <div class="image-preview hidden" id="preview_${name}">
            <img src="" alt="Preview">
            <button type="button" class="btn-remove-preview" data-field="${name}">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;
        break;

      case 'color':
        inputHTML = `
          <div class="color-input-group">
            <input type="color" id="field_${name}" name="${name}" class="form-color" value="${config.defaultValue || '#ffffff'}">
            <input type="text" id="field_${name}_text" class="form-input color-text" value="${config.defaultValue || '#ffffff'}" pattern="^#[0-9A-Fa-f]{6}$">
          </div>
        `;
        break;

      case 'number':
        inputHTML = `
          <input type="number" id="field_${name}" name="${name}" class="form-input" value="${config.defaultValue || ''}" step="any">
        `;
        break;

      default:
        inputHTML = `
          <textarea id="field_${name}" name="${name}" class="form-textarea" rows="2" placeholder="Enter ${label}...">${config.defaultValue || ''}</textarea>
        `;
    }

    return `
      <div class="form-field" data-name="${name}" data-type="${type}">
        <label for="field_${name}">
          <i class="fas fa-${icon}"></i>
          <span>${label}</span>
        </label>
        ${inputHTML}
      </div>
    `;
  }

  formatLabel(name) {
    return name
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // ==================== DATA COLLECTION ====================

  collectFormData(formElement) {
    const data = {};
    const fields = formElement.querySelectorAll('.form-field');

    fields.forEach(field => {
      const name = field.dataset.name;
      const type = field.dataset.type;

      if (type === 'color') {
        data[name] = field.querySelector('.form-color').value;
      } else if (type === 'image') {
        const input = field.querySelector('.form-input');
        const preview = field.querySelector('.image-preview img');
        data[name] = preview?.src || input.value;
      } else {
        const input = field.querySelector('.form-input, .form-textarea');
        data[name] = input?.value || '';
      }
    });

    return data;
  }

  validateData(data, placeholders) {
    const errors = [];

    for (const [name, config] of Object.entries(placeholders)) {
      const value = data[name];

      if (!value && !config.defaultValue) {
        errors.push(`${this.formatLabel(name)} is required`);
        continue;
      }

      if (config.type === 'number' && value) {
        if (isNaN(parseFloat(value))) {
          errors.push(`${this.formatLabel(name)} must be a number`);
        }
      }

      if (config.type === 'color' && value) {
        if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
          errors.push(`${this.formatLabel(name)} must be a valid hex color`);
        }
      }
    }

    return errors;
  }

  // ==================== DATA ROWS ====================

  createEmptyRow(placeholders) {
    const row = {};
    for (const [name, config] of Object.entries(placeholders)) {
      row[name] = config.defaultValue || '';
    }
    return row;
  }

  generateRowHTML(rowIndex, data, placeholders) {
    const fields = Object.entries(placeholders).map(([name, config]) => {
      const value = data[name] || config.defaultValue || '';
      const type = config.type || 'text';

      if (type === 'image' && value) {
        return `<td class="cell-image"><img src="${value}" alt="${name}"></td>`;
      } else if (type === 'color') {
        return `<td class="cell-color"><span class="color-chip" style="background:${value}"></span>${value}</td>`;
      } else {
        return `<td>${this.truncate(value, 30)}</td>`;
      }
    }).join('');

    return `
      <tr data-row="${rowIndex}">
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

  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // ==================== EXPORT ====================

  exportToCSV(rows, placeholders) {
    const headers = Object.keys(placeholders);
    const csvLines = [headers.join(',')];

    rows.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Escape quotes and wrap in quotes if contains comma or newline
        if (value.includes(',') || value.includes('\n') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvLines.push(values.join(','));
    });

    return csvLines.join('\n');
  }

  downloadCSV(content, filename = 'data.csv') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

// Export for use
window.PlaceholderManager = PlaceholderManager;
