vim.keymap.set("n", "<C-Left>", "b", { desc = "Voltar uma palavra" })
vim.keymap.set("n", "<C-Right>", "w", { desc = "Avancar uma palavra" })
vim.keymap.set("n", "<C-Up>", "{", { desc = "Paragrafo anterior" })
vim.keymap.set("n", "<C-Down>", "}", { desc = "Proximo paragrafo" })
vim.keymap.set("i", "<C-BS>", "<C-w>", { desc = "Delete previous word" })
vim.keymap.set("i", "<M-BS>", "<C-w>", { desc = "Delete previous word alt" })

-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here
