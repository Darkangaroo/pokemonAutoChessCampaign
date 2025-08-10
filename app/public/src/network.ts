import { nanoid } from "nanoid"
import store from "./stores"
import { logIn } from "./stores/NetworkStore"

interface OfflineUser {
  uid: string
  displayName: string
  getIdToken: () => Promise<string>
}

export function authenticateUser(): Promise<OfflineUser> {
  let uid = localStorage.getItem("offline-uid")
  if (!uid) {
    uid = nanoid()
    localStorage.setItem("offline-uid", uid)
  }
  const user: OfflineUser = {
    uid,
    displayName: "Offline Player",
    getIdToken: async () => ""
  }
  store.dispatch(logIn(user))
  return Promise.resolve(user)
}

export async function fetchProfile(forceRefresh: boolean = false) {
  const profile = store.getState().network.profile
  if (!forceRefresh && profile) {
    return Promise.resolve(profile)
  }
  return Promise.resolve(undefined)
}
