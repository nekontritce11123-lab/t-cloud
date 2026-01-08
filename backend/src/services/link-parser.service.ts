import ogs from 'open-graph-scraper';
import { ParsedLink } from '../types/index.js';

/**
 * Service for parsing links and extracting OpenGraph metadata
 */
export class LinkParserService {
  // Regex for extracting URLs from text
  private static URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

  /**
   * Extract all URLs from text
   */
  extractUrls(text: string): string[] {
    const matches = text.match(LinkParserService.URL_REGEX);
    return matches ? [...new Set(matches)] : []; // Remove duplicates
  }

  /**
   * Parse OpenGraph metadata for a URL
   */
  async parseOpenGraph(url: string): Promise<ParsedLink> {
    try {
      const { result, error } = await ogs({
        url,
        timeout: 10000,
        fetchOptions: {
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      });

      if (error) {
        console.error(`[LinkParser] OGS error for ${url}:`, error);
        return { url };
      }

      return {
        url,
        title: result.ogTitle || result.twitterTitle || this.extractDomain(url),
        description: result.ogDescription || result.twitterDescription,
        imageUrl: this.getImageUrl(result, url),
        siteName: result.ogSiteName,
      };
    } catch (err) {
      console.error(`[LinkParser] Failed to parse OpenGraph for ${url}:`, err);
      return { url };
    }
  }

  /**
   * Extract image URL from OG result and convert relative URLs to absolute
   */
  private getImageUrl(result: any, baseUrl: string): string | undefined {
    let imageUrl: string | undefined;

    if (result.ogImage && result.ogImage.length > 0) {
      imageUrl = result.ogImage[0].url;
    } else if (result.twitterImage && result.twitterImage.length > 0) {
      imageUrl = result.twitterImage[0].url;
    }

    if (!imageUrl) return undefined;

    // Преобразуем относительные URL в абсолютные
    try {
      // new URL() автоматически разрешит относительный путь (/images/x.jpg -> https://site.com/images/x.jpg)
      return new URL(imageUrl, baseUrl).href;
    } catch (e) {
      console.warn(`[LinkParser] Invalid image URL: ${imageUrl}`, e);
      return undefined;
    }
  }

  /**
   * Extract domain from URL for fallback title
   */
  private extractDomain(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  /**
   * Batch parse multiple URLs
   */
  async parseMultipleUrls(urls: string[]): Promise<ParsedLink[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.parseOpenGraph(url))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<ParsedLink> => r.status === 'fulfilled')
      .map(r => r.value);
  }
}
