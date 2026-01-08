const cloudinary = require('cloudinary').v2;

// Only load dotenv if not in production (Render provides env vars directly)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Validate and configure Cloudinary
function validateAndConfig() {
  const requiredEnv = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ];

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    const errorMsg = `Cloudinary configuration missing required env vars: ${missing.join(', ')}. ` +
      `Please set these in Render dashboard (Environment tab) or .env file locally.`;
    console.error('❌', errorMsg);
    throw new Error(errorMsg);
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Validate immediately (will throw if missing)
validateAndConfig();

/**
 * Upload a file to Cloudinary
 * @param {string} filePath - Local file path
 * @param {object} options - Upload options
 * @param {string} options.folder - Cloudinary folder path
 * @param {string} options.resourceType - 'image', 'video', or 'auto'
 * @param {string} options.publicId - Optional custom public ID
 * @returns {Promise<object>} Cloudinary upload result
 */
const uploadToCloudinary = async (filePath, options = {}) => {
  const {
    folder = 'echo-catering',
    resourceType = 'auto',
    publicId = null,
  } = options;

  try {
    const uploadOptions = {
      folder,
      resource_type: resourceType, // Use resource_type (Cloudinary API format)
      use_filename: false, // Don't use filename when publicId is provided
      unique_filename: false, // Don't make unique when publicId is provided
      overwrite: true, // Allow overwriting when re-processing videos
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      // When publicId is provided, don't use filename or unique_filename
      uploadOptions.use_filename = false;
      uploadOptions.unique_filename = false;
    }

    const result = await cloudinary.uploader.upload(filePath, uploadOptions);

    // CRITICAL: Assert secure_url exists
    if (!result.secure_url) {
      throw new Error(`Cloudinary upload succeeded but did not return secure_url. Result: ${JSON.stringify(result)}`);
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      duration: result.duration, // For videos
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
};

/**
 * Upload a buffer/stream to Cloudinary using upload_stream
 * @param {Buffer} buffer
 * @param {object} options
 * @returns {Promise<object>}
 */
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      folder = 'echo-catering',
      resourceType = 'auto',
      publicId = null,
    } = options;

    const uploadOptions = {
      folder,
      resource_type: resourceType,
      overwrite: true,
      use_filename: false,
      unique_filename: false,
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.use_filename = false;
      uploadOptions.unique_filename = false;
    }

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
      if (error) {
        return reject(new Error(`Failed to upload to Cloudinary: ${error.message}`));
      }
      if (!result || !result.secure_url) {
        return reject(new Error(`Cloudinary upload succeeded but no secure_url returned: ${JSON.stringify(result)}`));
      }
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
        duration: result.duration,
        resourceType: result.resource_type,
      });
    });

    stream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - 'image' or 'video'
 * @returns {Promise<object>} Deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
  }
};

module.exports = {
  uploadToCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
  cloudinary,
};

