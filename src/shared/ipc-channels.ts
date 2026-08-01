export const IPC_CHANNELS = {
  getSettings: 'foundation:get-settings',
  setPetVisibility: 'foundation:set-pet-visibility',
  openSettings: 'foundation:open-settings',
  getWindowKind: 'foundation:get-window-kind',
  getPetSystemSnapshot: 'pet-system:get-snapshot',
  createPet: 'pet-system:create-pet',
  importPetAssets: 'pet-system:import-assets',
  updatePet: 'pet-system:update-pet',
  setActivePet: 'pet-system:set-active-pet',
  movePetBy: 'pet-system:move-pet-by',
  showPetContextMenu: 'pet-system:show-context-menu',
  petSystemChanged: 'pet-system:changed'
} as const
