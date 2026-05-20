import { ApiProperty } from '@nestjs/swagger';

export class GetAllGamesDto {
    @ApiProperty({ example: "Assassin's Creed" })
    name: string;
    @ApiProperty({ example: 'ACU' })
    code: string;
}