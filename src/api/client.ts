// Using HTTPS API with Let's Encrypt certificate
const API_URL = import.meta.env.VITE_API_URL || 'https://api.factchain-traker.online';

console.log('[ApiClient] API_URL:', API_URL);

// Types
export type MediaType = 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'video_note' | 'animation' | 'sticker' | 'link';

export interface FileRecord {
  id: number;
  userId: number;
  fileId: string;
  fileUniqueId: string;
  originalMessageId: number;
  chatId: number;
  mediaType: MediaType;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  thumbnailFileId?: string | null;
  thumbnailUrl?: string | null;
  forwardFromName?: string | null;
  forwardFromChatTitle?: string | null;
  createdAt: string;
}

export interface LinkRecord {
  id: number;
  userId: number;
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CategoryStats {
  mediaType: MediaType;
  count: number;
}

class ApiClient {
  private initData: string = '';

  setInitData(initData: string): void {
    this.initData = initData;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.initData) {
      headers['X-Telegram-Init-Data'] = this.initData;
    } else if (import.meta.env.DEV) {
      // Development fallback
      headers['X-Dev-User-Id'] = '123456789';
    }

    return headers;
  }

  // Files API

  async getFiles(options: {
    type?: MediaType;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<FileRecord>> {
    const params = new URLSearchParams();
    if (options.type) params.set('type', options.type);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));

    console.log('[ApiClient] Fetching files from:', `${API_URL}/api/files?${params}`);
    console.log('[ApiClient] Headers:', JSON.stringify(this.getHeaders()));

    try {
      const response = await fetch(`${API_URL}/api/files?${params}`, {
        headers: this.getHeaders(),
      });

      console.log('[ApiClient] Response status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error('[ApiClient] Error response:', text);
        throw new Error('Failed to fetch files');
      }

      return response.json();
    } catch (error) {
      console.error('[ApiClient] Fetch error:', error);
      throw error;
    }
  }

  async getFilesByDate(): Promise<Record<string, FileRecord[]>> {
    const response = await fetch(`${API_URL}/api/files/by-date`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch files by date');
    }

    return response.json();
  }

  async searchFiles(query: string, limit = 50): Promise<{ items: FileRecord[]; total: number }> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });

    const response = await fetch(`${API_URL}/api/files/search?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to search files');
    }

    return response.json();
  }

  async getFileStats(): Promise<CategoryStats[]> {
    const response = await fetch(`${API_URL}/api/files/stats`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch stats');
    }

    return response.json();
  }

  async getFile(id: number): Promise<FileRecord> {
    const response = await fetch(`${API_URL}/api/files/${id}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch file');
    }

    return response.json();
  }

  async deleteFile(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/files/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
  }

  async sendFiles(fileIds: number[]): Promise<{ success: boolean; sent: number[]; errors?: string[] }> {
    const response = await fetch(`${API_URL}/api/files/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ fileIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to send files');
    }

    return response.json();
  }

  async sendFile(id: number): Promise<{ success: boolean }> {
    const response = await fetch(`${API_URL}/api/files/${id}/send`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to send file');
    }

    return response.json();
  }

  // Links API

  async getLinks(options: {
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<LinkRecord>> {
    const params = new URLSearchParams();
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));

    const response = await fetch(`${API_URL}/api/links?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch links');
    }

    return response.json();
  }

  async deleteLink(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/links/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete link');
    }
  }
}

export const apiClient = new ApiClient();
