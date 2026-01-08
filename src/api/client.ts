// Using HTTPS API with Let's Encrypt certificate
const API_URL = import.meta.env.VITE_API_URL || 'https://api.factchain-traker.online';

console.log('[ApiClient] API_URL:', API_URL);

// Types
export type MediaType = 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'video_note' | 'link';

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
  deletedAt?: string | null;
  // Share status (for instant UI without extra API call)
  hasShare?: boolean;
  // Search result fields (only present in search results)
  matchedField?: 'file_name' | 'caption' | 'forward_from_name' | 'forward_from_chat_title';
  matchedSnippet?: string;
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
  deletedAt?: string | null;
  // Search result fields (only present in search results)
  matchedField?: 'url' | 'title' | 'description' | 'site_name';
  matchedSnippet?: string;
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

export interface ShareInfo {
  id: number;
  fileId: number;
  token: string;
  maxRecipients: number | null;
  expiresAt: string | null;
  useCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShareResponse {
  share: ShareInfo;
  shareUrl: string;
  isExisting?: boolean;
  recipients?: number;
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

  async searchFiles(
    query: string,
    options?: {
      type?: string;
      deleted?: boolean;
      limit?: number;
      // Tag filters
      dateFrom?: string;
      dateTo?: string;
      sizeMin?: number;
      sizeMax?: number;
      from?: string;
      chat?: string;
      mimeType?: string; // File extension filter (e.g., "image/jpeg" for .jpg)
    }
  ): Promise<{ items: FileRecord[]; total: number }> {
    const params = new URLSearchParams();

    // Query is optional if filters are provided
    if (query && query.trim()) {
      params.set('q', query);
    }

    if (options?.limit !== undefined) {
      params.set('limit', String(options.limit));
    } else {
      params.set('limit', '50');
    }

    if (options?.type) {
      params.set('type', options.type);
    }

    if (options?.deleted !== undefined) {
      params.set('deleted', String(options.deleted));
    }

    // Tag filters
    if (options?.dateFrom) {
      params.set('dateFrom', options.dateFrom);
    }
    if (options?.dateTo) {
      params.set('dateTo', options.dateTo);
    }
    if (options?.sizeMin !== undefined) {
      params.set('sizeMin', String(options.sizeMin));
    }
    if (options?.sizeMax !== undefined) {
      params.set('sizeMax', String(options.sizeMax));
    }
    if (options?.from) {
      params.set('from', options.from);
    }
    if (options?.chat) {
      params.set('chat', options.chat);
    }
    if (options?.mimeType) {
      params.set('mimeType', options.mimeType);
    }

    const response = await fetch(`${API_URL}/api/files/search?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to search files');
    }

    return response.json();
  }

  

  async searchLinks(query: string, limit = 50): Promise<{ items: LinkRecord[]; total: number }> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });

    const response = await fetch(`${API_URL}/api/links/search?${params}`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to search links');
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
      if (response.status === 410) {
        throw new Error('FILE_UNAVAILABLE');
      }
      if (response.status === 403) {
        const data = await response.json();
        if (data.error === 'VOICE_FORBIDDEN') {
          throw new Error('VOICE_FORBIDDEN');
        }
      }
      throw new Error('Failed to send file');
    }

    return response.json();
  }

  // Video streaming API

  async getVideoUrl(fileId: number): Promise<{
    videoUrl: string;
    expiresIn: number;
    mimeType: string;
  }> {
    // First check if file exists and is a video
    const response = await fetch(`${API_URL}/api/files/${fileId}/video-url`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      if (response.status === 410) {
        throw new Error('VIDEO_UNAVAILABLE');
      }
      if (response.status === 400) {
        throw new Error('NOT_A_VIDEO');
      }
      throw new Error('Failed to get video URL');
    }

    const data = await response.json();

    // Return stream URL through our backend (bypasses CDN blocking)
    // Include initData as query param since <video> can't set headers
    const streamUrl = `${API_URL}/api/files/${fileId}/video-stream?initData=${encodeURIComponent(this.initData)}`;

    return {
      videoUrl: streamUrl,
      expiresIn: data.expiresIn,
      mimeType: data.mimeType,
    };
  }

  // Autocomplete Dictionary API

  async getDictionary(mediaType?: string): Promise<{ words: string[]; version: number }> {
    const params = new URLSearchParams();
    if (mediaType) params.set('type', mediaType);

    const url = params.toString()
      ? `${API_URL}/api/files/autocomplete/dictionary?${params}`
      : `${API_URL}/api/files/autocomplete/dictionary`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch dictionary');
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

  // Senders API (for autocomplete)

  async getSenders(): Promise<{ names: string[]; chats: string[] }> {
    const response = await fetch(`${API_URL}/api/files/senders`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch senders');
    }

    return response.json();
  }

  // Trash API - Files

  async getTrashFiles(): Promise<{ items: FileRecord[]; total: number }> {
    const response = await fetch(`${API_URL}/api/files/trash`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trash files');
    }

    return response.json();
  }

  async getTrashFilesCount(): Promise<{ count: number }> {
    const response = await fetch(`${API_URL}/api/files/trash/count`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trash count');
    }

    return response.json();
  }

  // Shared files API

  async getSharedFiles(): Promise<{ items: FileRecord[]; total: number }> {
    const response = await fetch(`${API_URL}/api/files/shared`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch shared files');
    }

    return response.json();
  }

  async getSharedFilesCount(): Promise<{ count: number }> {
    const response = await fetch(`${API_URL}/api/files/shared/count`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch shared files count');
    }

    return response.json();
  }

  async deleteFiles(fileIds: number[]): Promise<{ success: boolean; deleted: number }> {
    const response = await fetch(`${API_URL}/api/files/delete-many`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ fileIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to delete files');
    }

    return response.json();
  }

  async restoreFile(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/files/${id}/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to restore file');
    }
  }

  async permanentDeleteFile(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/files/${id}/permanent`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete file');
    }
  }

  // Trash API - Links

  async getTrashLinks(): Promise<{ items: LinkRecord[]; total: number }> {
    const response = await fetch(`${API_URL}/api/links/trash`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trash links');
    }

    return response.json();
  }

  async getTrashLinksCount(): Promise<{ count: number }> {
    const response = await fetch(`${API_URL}/api/links/trash/count`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch trash links count');
    }

    return response.json();
  }

  async deleteLinks(linkIds: number[]): Promise<{ success: boolean; deleted: number }> {
    const response = await fetch(`${API_URL}/api/links/delete-many`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ linkIds }),
    });

    if (!response.ok) {
      throw new Error('Failed to delete links');
    }

    return response.json();
  }

  async restoreLink(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/links/${id}/restore`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to restore link');
    }
  }

  async permanentDeleteLink(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/links/${id}/permanent`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to permanently delete link');
    }
  }

  // Share API

  async createShareLink(fileId: number, options?: {
    maxRecipients?: number;
    expiresIn?: number; // hours
  }): Promise<ShareResponse> {
    const response = await fetch(`${API_URL}/api/files/${fileId}/share`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(options || {}),
    });

    if (!response.ok) {
      throw new Error('Failed to create share link');
    }

    return response.json();
  }

  async getShareInfo(fileId: number): Promise<ShareResponse | null> {
    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}/share`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    } catch {
      return null;
    }
  }

  async deleteShareLink(token: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/shares/${token}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete share link');
    }
  }
}

export const apiClient = new ApiClient();
