import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const TEST_TOKEN = 'test-api-token';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    process.env.API_TOKEN = TEST_TOKEN;
  });

  afterAll(() => {
    delete process.env.API_TOKEN;
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('rejects requests without a bearer token', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${TEST_TOKEN}`)
      .expect(200)
      .expect('Hello World!');
  });

  it('keeps health endpoints public', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  afterEach(async () => {
    await app.close();
  });
});
