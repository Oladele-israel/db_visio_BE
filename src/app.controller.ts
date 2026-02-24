import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,) { }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('cache-set')
  async cacheSet() {
    await this.cacheManager.set('test', 'test-value', 300_000);
    console.log(this.cacheManager.stores);

    return 'Set Cache';
  }

  @Get('cache-get')
  async cacheGet() {
    const value = await this.cacheManager.get<string>('test');

    if (!value) {
      return {
        message: 'Cache miss',
        value: null,
      };
    }

    return {
      message: 'Cache hit',
      value,
    };
  }
}
