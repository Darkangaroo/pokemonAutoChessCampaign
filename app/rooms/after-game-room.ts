import { Dispatcher } from "@colyseus/command"
import { Client, Room } from "colyseus"
import AfterGamePlayer from "../models/colyseus-models/after-game-player"
import UserMetadata from "../models/mongo-models/user-metadata"
import { IAfterGamePlayer, Transfer } from "../types"
import { GameMode } from "../types/enum/Game"
import { logger } from "../utils/logger"
import AfterGameState from "./states/after-game-state"

export default class AfterGameRoom extends Room<AfterGameState> {
  dispatcher: Dispatcher<this>
  constructor() {
    super()
    this.dispatcher = new Dispatcher(this)
  }

  onCreate(options: {
    players: IAfterGamePlayer[]
    idToken: string
    elligibleToXP: boolean
    elligibleToELO: boolean
    gameMode: GameMode
  }) {
    logger.info("Create AfterGame ", this.roomId)

    this.state = new AfterGameState(options)
    // logger.debug('before', this.state.players);
    if (options.players) {
      options.players.forEach((plyr: IAfterGamePlayer) => {
        const player = new AfterGamePlayer(
          plyr.id,
          plyr.name,
          plyr.avatar,
          plyr.rank,
          plyr.pokemons,
          plyr.title,
          plyr.role,
          plyr.synergies,
          plyr.elo,
          plyr.moneyEarned,
          plyr.playerDamageDealt,
          plyr.rerollCount
        )
        this.state.players.set(player.id, player)
      })
    }
    this.clock.setTimeout(() => {
      // dispose the room automatically after 120 second
      this.disconnect()
    }, 120 * 1000)
  }

  async onAuth(client: Client, options: any, context: any) {
    try {
      super.onAuth(client, options, context)
      const uid = options.uid ?? client.sessionId
      const userProfile = await UserMetadata.findOne({ uid })

      if (userProfile?.banned) {
        throw "User banned"
      } else {
        return { uid, displayName: userProfile?.displayName ?? "Guest" }
      }
    } catch (error) {
      logger.error(error)
    }
  }

  onJoin(client: Client) {
    //logger.info(`${client.auth.email} join after game`)
  }

  async onLeave(client: Client, consented: boolean) {
    try {
      if (consented) {
        throw new Error("consented leave")
      }

      // allow disconnected client to reconnect into this room until 20 seconds
      await this.allowReconnection(client, 20)
    } catch (e) {
      /*if (client && client.auth && client.auth.displayName) {
        logger.info(`${client.auth.displayName} leave after game room`)
      }*/
    }
  }

  onDispose() {
    logger.info("dispose AfterGame ", this.roomId)
    this.dispatcher.stop()
  }
}
