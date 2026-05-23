import { ApiProperty } from '@nestjs/swagger';

export class GetUserGamesDto {

    @ApiProperty({ example: "Assassin's Creed" })
    game_name: string;

    @ApiProperty({ example: 'ACU' })
    game_code: string;

}