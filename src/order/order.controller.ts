import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { OrderCreateRequestDto } from './dto/order-create-request.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { ItemRequestDto } from './dto/item-request.dto';
import { ItemQuantityUpdateRequestDto } from './dto/item-quantity-update-request.dto';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard';
import { RolesGuard } from '../common/auth/roles.guard';
import { Roles } from '../common/auth/roles.decorator';
import { Role } from '../common/auth/role.enum';
import { SearchRequestDto } from '../common/filter/search-request.dto';
import { SearchService } from '../common/filter/search.service';
import { OrderResponseDto as ResponseDto } from './dto/order-response.dto';

@ApiTags('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER, Role.ADMIN)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly searchService: SearchService,
  ) {}

  @Post()
  create(@Body() dto: OrderCreateRequestDto): Promise<OrderResponseDto> {
    return this.orderService.create(dto);
  }

  @Get('search')
  async searchByGetMethod(@Query() query: Record<string, unknown>) {
    const criteria = this.searchService.parseQueryFilters(query);
    const page = await this.orderService.search(
      criteria,
      query.sort as string | undefined,
      (query.order as 'asc' | 'desc') ?? 'asc',
      Number(query.page ?? 0),
      Number(query.size ?? 20),
    );
    return { ...page, content: page.content.map((o) => ResponseDto.from(o)) };
  }

  @Post('search')
  async searchByPostMethod(@Body() body: SearchRequestDto) {
    const criteria = this.searchService.parseBodyFilters(body);
    const page = await this.orderService.search(criteria, body.sort, body.order, body.page, body.size);
    return { ...page, content: page.content.map((o) => ResponseDto.from(o)) };
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.orderService.findById(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.orderService.delete(id);
  }

  @Post(':id/items')
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ItemRequestDto): Promise<OrderResponseDto> {
    return this.orderService.addItem(id, dto);
  }

  @Patch(':orderId/items/:itemId')
  updateItemQuantity(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: ItemQuantityUpdateRequestDto,
  ): Promise<OrderResponseDto> {
    return this.orderService.updateItemQuantity(orderId, itemId, dto);
  }

  @Delete(':orderId/items/:itemId')
  removeItem(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<OrderResponseDto> {
    return this.orderService.removeItem(orderId, itemId);
  }

  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.orderService.confirm(id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<OrderResponseDto> {
    return this.orderService.cancel(id);
  }
}
