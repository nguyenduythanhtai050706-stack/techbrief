import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateSourceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;
}
