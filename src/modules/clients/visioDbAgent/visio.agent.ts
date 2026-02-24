import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios'

@Injectable()
export class VisioAgentService {
    private readonly baseUrl: string;
    private readonly xApiKey: string;
    private readonly logger = new Logger(VisioAgentService.name);

    constructor(private readonly configService: ConfigService) {
        this.baseUrl = this.configService.getOrThrow<string>('VISIO_AGENT_BASE_URL');
        this.xApiKey = this.configService.getOrThrow<string>('VISIO_AGENT_X_API_KEY');
    }

  public async testHello(): Promise<any> {
    try {
      const url = `${this.baseUrl}/`;
      const headers = {
        // 'x-api-key': this.xApiKey, 
        'Content-Type': 'application/json',
      };

      const response = await axios.get(url, { headers },);
      const result = response.data;
      this.logger.debug(result);
      if (!result) {
          this.logger.error(result);
          throw new BadRequestException('Error contacting db agent');
      }
      return result;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException('Error contacting db agent');
    }
      
  }
  
}

