import { Body, Controller, Get, Module, Post, Version } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  getSchemaPath,
} from '@nestjs/swagger';

export class CatDto {
  @ApiProperty({ enum: ['cat'] })
  kind: 'cat';

  @ApiProperty()
  lives: number;
}

export class DogDto {
  @ApiProperty({ enum: ['dog'] })
  kind: 'dog';

  @ApiProperty()
  goodBoy: boolean;
}

@ApiExtraModels(CatDto, DogDto)
@Controller('pets')
export class PetsController {
  @Get()
  @Version('1')
  listV1() {
    return [];
  }

  @Get()
  @Version('2')
  listV2() {
    return [];
  }

  @Get('legacy')
  @Version('1')
  @ApiOkResponse({ description: 'old' })
  legacy() {
    return [];
  }

  @Post()
  @Version('1')
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(CatDto) }, { $ref: getSchemaPath(DogDto) }],
      discriminator: {
        propertyName: 'kind',
        mapping: { cat: getSchemaPath(CatDto), dog: getSchemaPath(DogDto) },
      },
    },
  })
  create(@Body() body: unknown) {
    return body;
  }
}

@Module({ controllers: [PetsController] })
export class PetsModule {}
