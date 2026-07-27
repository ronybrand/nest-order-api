import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { CustomerRequestDto } from './dto/customer-request.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { Role } from '../common/auth/role.enum';
import { SearchRequestDto } from '../common/filter/search-request.dto';
import { SearchService } from '../common/filter/search.service';
import { CustomerResponseDto as ResponseDto } from './dto/customer-response.dto';

@ApiTags('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly searchService: SearchService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    return this.customerService.create(dto);
  }

  @Get('search')
  @Roles(Role.USER, Role.ADMIN)
  async searchByGetMethod(@Query() query: Record<string, unknown>) {
    const criteria = this.searchService.parseQueryFilters(query);
    const page = await this.customerService.search(
      criteria,
      query.sort as string | undefined,
      (query.order as 'asc' | 'desc') ?? 'asc',
      Number(query.page ?? 0),
      Number(query.size ?? 20),
    );
    return { ...page, content: page.content.map((c) => ResponseDto.from(c)) };
  }

  @Post('search')
  @Roles(Role.USER, Role.ADMIN)
  async searchByPostMethod(@Body() body: SearchRequestDto) {
    const criteria = this.searchService.parseBodyFilters(body);
    const page = await this.customerService.search(criteria, body.sort, body.order, body.page, body.size);
    return { ...page, content: page.content.map((c) => ResponseDto.from(c)) };
  }

  @Get(':id')
  @Roles(Role.USER, Role.ADMIN)
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerResponseDto> {
    return this.customerService.findById(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CustomerRequestDto): Promise<CustomerResponseDto> {
    return this.customerService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.customerService.delete(id);
  }
}
