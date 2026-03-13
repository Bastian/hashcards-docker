{ pkgs ? import <nixpkgs> {} }:

let
  hashcardsVersion = builtins.replaceStrings ["\n"] [""] (builtins.readFile ./HASHCARDS_VERSION);
in

pkgs.mkShell {
  buildInputs = with pkgs; [
    cargo
    rustc
    deno
  ];

  shellHook = ''
    export PATH="$HOME/.cargo/bin:$PATH"
    if ! command -v hashcards &> /dev/null; then
      echo "Installing hashcards..."
      cargo install hashcards@${hashcardsVersion}
    fi
  '';
}
