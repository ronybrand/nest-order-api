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

@ApiTags('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
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
  searchByGetMethod(@Query() query: SearchRequestDto) {
    return this.searchService.executeSearch(
      query,
      (criteria, sort, order, page, size) => this.customerService.search(criteria, sort, order, page, size),
      CustomerResponseDto.from,
    );
  }

  @Post('search')
  searchByPostMethod(@Body() body: SearchRequestDto) {
    return this.searchService.executeSearch(
      body,
      (criteria, sort, order, page, size) => this.customerService.search(criteria, sort, order, page, size),
      CustomerResponseDto.from,
    );
  }

  @Get(':id')
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
