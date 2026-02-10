import { Type } from 'class-transformer';
import { IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';

export class PutCartItemDto {
  @IsUUID()
  variantId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class PutCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PutCartItemDto)
  items!: PutCartItemDto[];
}
