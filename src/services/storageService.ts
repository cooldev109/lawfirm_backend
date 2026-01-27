import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface StoredFile {
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
}

export const storageService = {
  getBasePath(): string {
    return path.resolve(config.storage.path);
  },

  getCaseFolderPath(caseId: string): string {
    return path.join(this.getBasePath(), caseId);
  },

  ensureCaseFolderExists(caseId: string): void {
    const folderPath = this.getCaseFolderPath(caseId);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
      logger.debug(`Created case folder: ${folderPath}`);
    }
  },

  generateFilename(originalFilename: string): string {
    const ext = path.extname(originalFilename);
    const uuid = uuidv4();
    const timestamp = Date.now();
    return `${timestamp}-${uuid}${ext}`;
  },

  async saveFile(caseId: string, file: UploadedFile): Promise<StoredFile> {
    this.ensureCaseFolderExists(caseId);

    const filename = this.generateFilename(file.originalname);
    const filePath = path.join(this.getCaseFolderPath(caseId), filename);
    const relativePath = path.join(caseId, filename);

    // Check file size limit
    const maxSizeBytes = config.storage.maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error(`File size exceeds maximum allowed (${config.storage.maxFileSizeMB}MB)`);
    }

    // Write file to disk
    await fs.promises.writeFile(filePath, file.buffer);

    logger.info(`File saved: ${relativePath} (${file.size} bytes)`);

    return {
      filename,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      storagePath: relativePath,
    };
  },

  async saveFiles(caseId: string, files: UploadedFile[]): Promise<StoredFile[]> {
    const savedFiles: StoredFile[] = [];

    for (const file of files) {
      const storedFile = await this.saveFile(caseId, file);
      savedFiles.push(storedFile);
    }

    return savedFiles;
  },

  async deleteFile(storagePath: string): Promise<boolean> {
    const fullPath = path.join(this.getBasePath(), storagePath);

    try {
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
        logger.info(`File deleted: ${storagePath}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error(`Error deleting file ${storagePath}:`, error);
      throw error;
    }
  },

  async getFileBuffer(storagePath: string): Promise<Buffer> {
    const fullPath = path.join(this.getBasePath(), storagePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error('File not found');
    }

    return fs.promises.readFile(fullPath);
  },

  getFilePath(storagePath: string): string {
    return path.join(this.getBasePath(), storagePath);
  },

  fileExists(storagePath: string): boolean {
    const fullPath = path.join(this.getBasePath(), storagePath);
    return fs.existsSync(fullPath);
  },

  async deleteCaseFolder(caseId: string): Promise<void> {
    const folderPath = this.getCaseFolderPath(caseId);

    if (fs.existsSync(folderPath)) {
      await fs.promises.rm(folderPath, { recursive: true, force: true });
      logger.info(`Case folder deleted: ${folderPath}`);
    }
  },

  getAllowedMimeTypes(): string[] {
    return [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'text/plain',
      'text/csv',
    ];
  },

  isAllowedMimeType(mimeType: string): boolean {
    return this.getAllowedMimeTypes().includes(mimeType);
  },
};
