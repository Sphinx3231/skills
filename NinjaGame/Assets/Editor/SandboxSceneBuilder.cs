using System.IO;
using NinjaGame.Player;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace NinjaGame.Editor
{
    /// <summary>
    /// Headless scene-construction utility for the Player Movement sandbox.
    /// Run via:
    /// Unity.exe -batchmode -nographics -projectPath NinjaGame
    ///   -executeMethod NinjaGame.Editor.SandboxSceneBuilder.BuildPlayerMovementSandbox
    ///   -quit -logFile <log>
    /// </summary>
    public static class SandboxSceneBuilder
    {
        private const string ScenePath = "Assets/Scenes/Sandbox/PlayerMovementSandbox.unity";
        private const string PlaceholderSpritePath = "Assets/Art/Sprites/PlaceholderSquare.png";

        public static void BuildPlayerMovementSandbox()
        {
            Sprite placeholderSprite = GetOrCreatePlaceholderSprite();

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            CreatePlayer(placeholderSprite);
            CreateWall("Wall_North", new Vector2(0f, 4f), new Vector2(8f, 1f));
            CreateWall("Wall_East", new Vector2(5f, 0f), new Vector2(1f, 8f));

            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            bool saved = EditorSceneManager.SaveScene(scene, ScenePath);

            Debug.Log(saved ? "SANDBOX_SCENE_BUILT_OK" : "SANDBOX_SCENE_BUILD_FAILED");
        }

        private static void CreatePlayer(Sprite sprite)
        {
            var player = new GameObject("Player");

            var spriteRenderer = player.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = sprite;

            // PlayerMovement's [RequireComponent(typeof(Rigidbody2D))] auto-adds the Rigidbody2D.
            var movement = player.AddComponent<PlayerMovement>();
            player.AddComponent<PlayerStealthState>();

            var rb = player.GetComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Dynamic;
            rb.gravityScale = 0f;
            rb.constraints = RigidbodyConstraints2D.FreezeRotation;
            rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;

            var collider = player.AddComponent<BoxCollider2D>();
            collider.size = Vector2.one;

            player.transform.position = Vector3.zero;
        }

        private static void CreateWall(string name, Vector2 position, Vector2 size)
        {
            var wall = new GameObject(name);
            wall.transform.position = position;

            var collider = wall.AddComponent<BoxCollider2D>();
            collider.size = size;

            var spriteRenderer = wall.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = GetOrCreatePlaceholderSprite();
            spriteRenderer.color = Color.gray;
            wall.transform.localScale = new Vector3(size.x, size.y, 1f);
        }

        private static Sprite GetOrCreatePlaceholderSprite()
        {
            var existing = AssetDatabase.LoadAssetAtPath<Sprite>(PlaceholderSpritePath);
            if (existing != null)
            {
                return existing;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(PlaceholderSpritePath));

            var texture = new Texture2D(8, 8, TextureFormat.RGBA32, false);
            var pixels = new Color32[8 * 8];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = Color.white;
            }
            texture.SetPixels32(pixels);
            texture.Apply();

            byte[] pngData = texture.EncodeToPNG();
            File.WriteAllBytes(PlaceholderSpritePath, pngData);
            Object.DestroyImmediate(texture);

            AssetDatabase.ImportAsset(PlaceholderSpritePath, ImportAssetOptions.ForceUpdate);

            var importer = AssetImporter.GetAtPath(PlaceholderSpritePath) as TextureImporter;
            if (importer != null)
            {
                importer.textureType = TextureImporterType.Sprite;
                importer.spriteImportMode = SpriteImportMode.Single;
                importer.spritePixelsPerUnit = 8;
                importer.filterMode = FilterMode.Point;
                EditorUtility.SetDirty(importer);
                importer.SaveAndReimport();
            }

            return AssetDatabase.LoadAssetAtPath<Sprite>(PlaceholderSpritePath);
        }
    }
}
