# Self-hosted typefaces

## Disket Mono

Regular and Bold WOFF2 files, with the accompanying EULA, copied unchanged from the [EVE Frontier builders program font directory](https://github.com/evefrontier/eve-frontier-builders-program/tree/346c64807e4bdefb4c44b94f7e56cc17d0a9bc66/web/app/fonts).

Source revision: `346c64807e4bdefb4c44b94f7e56cc17d0a9bc66`.

Permission to use these files was confirmed by the project owner. The upstream name is **Disket Mono**. See `Disket-Mono-EULA.pdf` for the supplied license terms. No relicensing or ownership of these fonts is claimed.

## Inter

Variable WOFF2 from [rsms/inter v4.1](https://github.com/rsms/inter/tree/v4.1), the latest stable release at the time of inclusion. Licensed under the SIL Open Font License 1.1; copyright and full license are retained in `Inter-LICENSE.txt`.

## Integrity

All font binaries and upstream license files are unchanged. Verify their pinned SHA-256 hashes with:

```sh
cd fonts
sha256sum --check SHA256SUMS
```

The application serves these files from this directory. It makes no font-provider or CDN requests.
