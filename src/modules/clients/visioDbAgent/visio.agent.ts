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

   public async connectToDb(data:any): Promise<any> {
    try {
      const url = `${this.baseUrl}/db/connect`;
      const headers = {
        // 'x-api-key': this.xApiKey, 
        'Content-Type': 'application/json',
      };

      const response = await axios.post(url, data, { headers },);
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

  public async getDbSchema(sessionId: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/schema/`;
      const headers = {
        // 'x-api-key': this.xApiKey, 
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.get(url, { headers });
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

  public async getTableRelation(
    sessionId: string,
    table: string,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/relation/${table}`;

      const headers = {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.get(url, { headers });

      const result = response.data;

      this.logger.debug(result);

      if (!result) {
        throw new BadRequestException(
          'Error contacting db agent',
        );
      }

      return result;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(
        'Error contacting db agent',
      );
    }
  }

  public async queryRelations(
    sessionId: string,
    payload: any,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/query/relations/query`;

      const headers = {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(url, payload, { headers });

      return response.data;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(
        'Error contacting db agent',
      );
    }
  }

  public async queryTable(
    sessionId: string,
    payload: any,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/query/${payload.tableName}/query`;

      const headers = {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(url, payload, { headers });

      return response.data;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(
        'Error contacting db agent',
      );
    }
  }

  public async getRowRelations(
    sessionId: string,
    table: string,
    pk: string,
    relationTable: string,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/query/${table}/rows/${pk}/relations/${relationTable}`;

      const headers = {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.get(url, { headers });

      return response.data;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(
        'Error contacting db agent',
      );
    }
  }

  public async invalidateSchemaCache(
    sessionId: string,
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/schema/cache`;

      const headers = {
        'x-session-id': sessionId,
        'Content-Type': 'application/json',
      };

      const response = await axios.delete(url, { headers });
       this.logger.debug(`Schema cache invalidated for session ${sessionId}`);
            return response.data;

      return response.data;
    } catch (error) {
      this.logger.error(error);
      throw new BadRequestException(
        'Error contacting db agent',
      );
    }
  }

}
     