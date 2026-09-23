import { Controller, Get, Version } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';

class CatDto {
  @ApiProperty()
  name: string;
}

@ApiTags('cats')
@Controller('cats')
export class CatsController {
  @Get()
  @Version('1')
  @ApiOkResponse({ type: [CatDto], description: 'All cats' })
  listV1(): CatDto[] {
    return [{ name: 'Tom' }];
  }

  @Get()
  @Version('2')
  @ApiOkResponse({ type: [CatDto], description: 'All cats, sorted' })
  listV2(): CatDto[] {
    return [{ name: 'Felix' }, { name: 'Tom' }];
  }
}
